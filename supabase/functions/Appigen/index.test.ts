import { beforeAll, describe, expect, it, vi } from "vitest";

describe("Appigen v126 provider and review behavior", () => {
  let providerErrorCode: (status: number, metadata?: string) => string;
  let incrementalReviewResponse: (code: string) => Record<string, unknown>;
  let splitPromptIntoChunks: (prompt: string, maxCharacters?: number) => string[];
  let mergeProjectFiles: (original: string, generated: string) => string;
  let providerRequestBody: (provider: string, body: Record<string, unknown>) => Record<string, unknown>;
  let providerFallbackOrder: (providers: Record<string, string>, requested: string) => string[];

  beforeAll(async () => {
    (globalThis as typeof globalThis & {
      Deno?: { env: { get: () => undefined }; serve: ReturnType<typeof vi.fn> };
    }).Deno = {
      env: { get: () => undefined },
      serve: vi.fn(),
    };
    ({ providerErrorCode, incrementalReviewResponse, splitPromptIntoChunks, mergeProjectFiles, providerRequestBody, providerFallbackOrder } = await import("./index.ts"));
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
});
