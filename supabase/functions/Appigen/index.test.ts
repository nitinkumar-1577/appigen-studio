import { beforeAll, describe, expect, it, vi } from "vitest";

describe("Appigen v126 provider and review behavior", () => {
  let providerErrorCode: (status: number, metadata?: string) => string;
  let providerErrorMetadata: (text: string, apiKey?: string) => string;
  let incrementalReviewResponse: (code: string) => Record<string, unknown>;
  let splitPromptIntoChunks: (prompt: string, maxCharacters?: number) => string[];
  let mergeProjectFiles: (original: string, generated: string) => string;
  let providerRequestBody: (provider: string, body: Record<string, unknown>) => Record<string, unknown>;
  let providerFallbackOrder: (providers: Record<string, string>, requested: string) => string[];
  let executeProviderFailover: <T>(providers: Record<string, string>, requested: string, attempt: (provider: string) => Promise<T>) => Promise<{ provider: string; value: T }>;
  let isProviderUnavailable: (error: unknown) => boolean;
  let relevantProjectSource: (source: string, prompt: string) => string;
  let outputTokenBudget: (provider: string, inputCharacters?: number) => number;
  let validatePlannedFiles: (source: string, plan: unknown) => string | null;
  beforeAll(async () => {
    (globalThis as typeof globalThis & {
      Deno?: { env: { get: () => undefined }; serve: ReturnType<typeof vi.fn> };
    }).Deno = {
      env: { get: () => undefined },
      serve: vi.fn(),
    };
  ({ providerErrorCode, providerErrorMetadata, incrementalReviewResponse, splitPromptIntoChunks, mergeProjectFiles, providerRequestBody, providerFallbackOrder, executeProviderFailover, isProviderUnavailable, relevantProjectSource, outputTokenBudget, validatePlannedFiles } = await import("./index.ts"));
  });
  it("rejects generation when any planned file is missing", () => {
    const plan = {
      fileBlueprint: [
        { path: "src/App.tsx" },
        { path: "src/styles.css" },
        { path: "src/pages/HomePage.tsx" },
      ],
    };

    const source = [
      "// FILE: src/App.tsx",
      "export default function App() { return null; }",
      "// FILE: src/styles.css",
      "body { margin: 0; }",
    ].join("\n");

    expect(validatePlannedFiles(source, plan)).toContain(
      "src/pages/HomePage.tsx",
    );
  });

  it("passes when every planned file is generated", () => {
    const plan = {
      fileBlueprint: [
        { path: "src/App.tsx" },
        { path: "src/styles.css" },
      ],
    };

    const source = [
      "// FILE: src/App.tsx",
      "export default function App() { return null; }",
      "// FILE: src/styles.css",
      "body { margin: 0; }",
    ].join("\n");

    expect(validatePlannedFiles(source, plan)).toBeNull();
  });

  it("rejects an empty implementation file blueprint", () => {
    expect(validatePlannedFiles("", { fileBlueprint: [] })).toContain(
      "no project file blueprint",
    );
  });
  it("preserves provider output budgets for per-file generation", () => {
    expect(outputTokenBudget("groq", 100)).toBe(4000);
    expect(outputTokenBudget("groq", 9000)).toBe(4500);
    expect(outputTokenBudget("nvidia", 9000)).toBe(4500);
  });

  it("classifies Groq token-limit HTTP 413 responses as rate limited", () => {
    expect(providerErrorCode(413, "provider_code=rate_limit_exceeded provider_type=tokens"))
      .toBe("RATE_LIMITED");
  });

  it("does not classify unrelated HTTP 413 responses as rate limited", () => {
    expect(providerErrorCode(413, "provider_code=bad_request provider_type=tokens"))
      .toBe("REQUEST_REJECTED");
  });

  it("returns existing generated code with the incremental review skip metadata", () => {
    expect(incrementalReviewResponse("generated source")).toEqual({
      code: "generated source",
      mode: "review",
      reviewSkipped: true,
      reviewReason: "incremental_edit_token_saving",
    });
  });

  it("splits long requirements without dropping text", () => {
      const prompt = "First requirement. ".repeat(20) + "\n\nSecond requirement. ".repeat(20);
      const chunks = splitPromptIntoChunks(prompt, 100);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.join(" ")).toContain("First requirement.");
      expect(chunks.join(" ")).toContain("Second requirement.");
    });

  it("merges generated files over untouched existing files", () => {
      const original = "// FILE: src/App.tsx\nold app\n\n// FILE: src/Keep.tsx\nkeep me";
      const generated = "// FILE: src/App.tsx\nnew app";
      expect(mergeProjectFiles(original, generated)).toContain("// FILE: src/Keep.tsx\nkeep me");
      expect(mergeProjectFiles(original, generated)).toContain("// FILE: src/App.tsx\nnew app");
    });

  it("maps provider-specific output token parameters", () => {
      const body = { messages: [], max_completion_tokens: 1234 };
      expect(providerRequestBody("nvidia", body)).toMatchObject({ max_tokens: 1234 });
      const nvidiaBody = providerRequestBody("nvidia", body);
      expect(nvidiaBody).toMatchObject({ max_tokens: 1234, stream: false });
      expect(nvidiaBody).not.toHaveProperty("max_completion_tokens");
      expect(nvidiaBody).not.toHaveProperty("chat_template");
      expect(providerRequestBody("gemini", body)).toMatchObject({ generationConfig: { maxOutputTokens: 1234 } });
  });

  it("sends Groq requests through the OpenAI-compatible gateway shape", () => {
    const body = { messages: [], max_completion_tokens: 1234, reasoning_effort: "low", include_reasoning: false };
    const groqBody = providerRequestBody("groq", body);
    expect(groqBody).toMatchObject({ max_completion_tokens: 1234, stream: false, include_reasoning: false });
  });

  it("fails over only across the three active providers", () => {
    expect(providerFallbackOrder({ groqKey: "groq", nvidiaKey: "nvidia", geminiKey: "gemini" }, "groq"))
      .toEqual(["groq", "nvidia", "gemini"]);
    expect(providerFallbackOrder({ groqKey: "groq", nvidiaKey: "nvidia" }, "nvidia"))
      .toEqual(["nvidia", "groq"]);
  });

  it("keeps a successful primary result without calling fallback", async () => {
    const calls: string[] = [];
    const result = await executeProviderFailover({ groqKey: "groq", nvidiaKey: "nvidia" }, "groq", async (provider) => {
      calls.push(provider);
      return "generated";
    });
    expect(result).toEqual({ provider: "groq", value: "generated" });
    expect(calls).toEqual(["groq"]);
  });

  it("falls back once for timeout and rate-limit failures", async () => {
    for (const error of [new Error("Groq 504 [TIMEOUT]"), new Error("Groq 429 [RATE_LIMITED]")]) {
      const calls: string[] = [];
      const result = await executeProviderFailover({ groqKey: "groq", nvidiaKey: "nvidia" }, "groq", async (provider) => {
        calls.push(provider);
        if (provider === "groq") throw error;
        return "fallback output";
      });
      expect(result).toEqual({ provider: "nvidia", value: "fallback output" });
      expect(calls).toEqual(["groq", "nvidia"]);
    }
  });

  it("reports both transient provider failures and never retries a provider", async () => {
    const calls: string[] = [];
    await expect(executeProviderFailover({ groqKey: "groq", nvidiaKey: "nvidia" }, "groq", async (provider) => {
      calls.push(provider);
      throw new Error(`${provider} 503 temporarily unavailable`);
    })).rejects.toThrow(/Groq.*NVIDIA/);
    expect(calls).toEqual(["groq", "nvidia"]);
  });

  it("fails over when a provider rejects its request and reports every failure", async () => {
    const calls: string[] = [];
    await expect(executeProviderFailover({ groqKey: "groq", nvidiaKey: "nvidia" }, "groq", async (provider) => {
      calls.push(provider);
      throw new Error(`${provider} 400 [REQUEST_REJECTED]`);
    })).rejects.toThrow(/Groq.*NVIDIA.*400/);
    expect(calls).toEqual(["groq", "nvidia"]);
    expect(isProviderUnavailable(new Error("Groq 400 [REQUEST_REJECTED]"))).toBe(true);
  });

  it("includes a sanitized provider error reason without exposing the API key", () => {
    const apiKey = "nvapi-secret-value-123456789";
    const metadata = providerErrorMetadata(JSON.stringify({
      error: { message: `Unknown request field. ${apiKey}`, type: "Bad Request", param: "chat_template" },
      code: "invalid_request",
    }), apiKey);
    expect(metadata).toContain("provider_param=chat_template");
    expect(metadata).toContain("provider_message=Unknown request field. [REDACTED]");
    expect(metadata).not.toContain(apiKey);
  });

  it("tries only the configured active providers during fallback", () => {
    expect(providerFallbackOrder({ groqKey: "groq", nvidiaKey: "nvidia", geminiKey: "gemini" }, "groq"))
      .toEqual(["groq", "nvidia", "gemini"]);
  });

  it("includes relative import dependencies in large-project context", () => {
    const files = [
      "// FILE: src/App.tsx\nimport Shell from './components/Shell';\nexport default Shell;",
      "// FILE: src/components/Shell.tsx\nimport { format } from '../lib/format';\nexport default function Shell() { return format(); }",
      "// FILE: src/lib/format.ts\nexport function format() { return 'ok'; }",
      "// FILE: src/pages/Unrelated.tsx\nexport default function Unrelated() { return null; }",
      "// FILE: src/pages/Another.tsx\nexport default function Another() { return null; }",
      "// FILE: src/data/one.ts\nexport const one = 1;",
      "// FILE: src/data/two.ts\nexport const two = 2;",
      "// FILE: src/data/three.ts\nexport const three = 3;",
      "// FILE: src/data/four.ts\nexport const four = 4;",
    ].join("\n\n");
    const context = relevantProjectSource(files, "understand the app shell");
    expect(context).toContain("src/components/Shell.tsx");
    expect(context).toContain("src/lib/format.ts");
    expect(context).not.toContain("src/pages/Unrelated.tsx");
  });
});
