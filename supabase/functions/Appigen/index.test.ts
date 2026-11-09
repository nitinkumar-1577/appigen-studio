import { beforeAll, describe, expect, it, vi } from "vitest";

describe("Appigen v126 provider and review behavior", () => {
  let providerErrorCode: (status: number, metadata?: string) => string;
  let incrementalReviewResponse: (code: string) => Record<string, unknown>;
  let splitPromptIntoChunks: (prompt: string, maxCharacters?: number) => string[];
  let mergeProjectFiles: (original: string, generated: string) => string;
  let providerRequestBody: (provider: string, body: Record<string, unknown>) => Record<string, unknown>;
  let providerFallbackOrder: (providers: Record<string, string>, requested: string) => string[];
  let executeProviderFailover: <T>(providers: Record<string, string>, requested: string, attempt: (provider: string) => Promise<T>) => Promise<{ provider: string; value: T }>;
  let isProviderUnavailable: (error: unknown) => boolean;
  let relevantProjectSource: (source: string, prompt: string) => string;

  beforeAll(async () => {
    (globalThis as typeof globalThis & {
      Deno?: { env: { get: () => undefined }; serve: ReturnType<typeof vi.fn> };
    }).Deno = {
      env: { get: () => undefined },
      serve: vi.fn(),
    };
    ({ providerErrorCode, incrementalReviewResponse, splitPromptIntoChunks, mergeProjectFiles, providerRequestBody, providerFallbackOrder, executeProviderFailover, isProviderUnavailable, relevantProjectSource } = await import("./index.ts"));
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
      expect(providerRequestBody("deepseek", body)).toMatchObject({ max_tokens: 1234 });
      expect(providerRequestBody("nvidia", body)).toMatchObject({ max_tokens: 1234, chat_template: "default" });
      expect(providerRequestBody("gemini", body)).toMatchObject({ generationConfig: { maxOutputTokens: 1234 } });
  });

  it("tries the selected configured provider before alternatives", () => {
    expect(providerFallbackOrder({
      groqKey: "groq",
      deepseekKey: "deepseek",
      openrouterKey: "router",
    }, "deepseek")).toEqual(["deepseek", "groq", "openrouter"]);
  });

  it("uses Groq first and NVIDIA second for configured failover", () => {
    expect(providerFallbackOrder({
      groqKey: "groq",
      nvidiaKey: "nvidia",
    }, "groq")).toEqual(["groq", "nvidia"]);
    expect(providerFallbackOrder({
      groqKey: "groq",
      nvidiaKey: "nvidia",
    }, "nvidia")).toEqual(["nvidia", "groq"]);
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

  it("does not fail over normal 400 user errors", async () => {
    const calls: string[] = [];
    await expect(executeProviderFailover({ groqKey: "groq", nvidiaKey: "nvidia" }, "groq", async (provider) => {
      calls.push(provider);
      throw new Error(`${provider} 400 [REQUEST_REJECTED]`);
    })).rejects.toThrow("400");
    expect(calls).toEqual(["groq"]);
    expect(isProviderUnavailable(new Error("Groq 400 [REQUEST_REJECTED]"))).toBe(false);
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
