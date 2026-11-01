import { describe, expect, it } from "vitest";
import { authErrorMessage, classifyAuthError } from "./authErrors";

describe("auth error handling", () => {
  it("classifies common Supabase authentication errors", () => {
    expect(classifyAuthError(new Error("Invalid login credentials"))).toBe("invalid_credentials");
    expect(classifyAuthError(new Error("User already registered"))).toBe("email_exists");
    expect(classifyAuthError(new Error("Unsupported provider: provider is not enabled"))).toBe("provider_disabled");
  });

  it("returns actionable messages without hiding provider failures", () => {
    expect(authErrorMessage(new Error("Invalid login credentials"), "fallback")).toContain("email or password");
    expect(authErrorMessage(new Error("network unavailable"), "Try again")).toBe("network unavailable");
  });
});
