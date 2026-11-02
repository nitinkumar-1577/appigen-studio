import { beforeAll, describe, expect, it, vi } from "vitest";

describe("Appigen v126 provider and review behavior", () => {
  let providerErrorCode: (status: number, metadata?: string) => string;
  let incrementalReviewResponse: (code: string) => Record<string, unknown>;

  beforeAll(async () => {
    (globalThis as typeof globalThis & {
      Deno?: { env: { get: () => undefined }; serve: ReturnType<typeof vi.fn> };
    }).Deno = {
      env: { get: () => undefined },
      serve: vi.fn(),
    };
    ({ providerErrorCode, incrementalReviewResponse } = await import("./index.ts"));
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
});
