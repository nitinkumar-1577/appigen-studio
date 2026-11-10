import { describe, expect, it } from "vitest";
import {
  classifyProviderStatus,
  getDefaultModel,
  getProviderConfig,
  PROVIDER_NAMES,
} from "./providerCatalog";

describe("provider catalog", () => {
  it("keeps all configured providers and exact secret names", () => {
    expect(PROVIDER_NAMES).toEqual(["groq", "deepseek", "openrouter", "gemini", "openai", "nvidia"]);
    expect(getProviderConfig("deepseek").secretNames).toContain("DEEPSEEK-API-KEY");
    expect(getProviderConfig("nvidia").secretNames).toContain("NVIDIA_API_KEY");
  });

  it("uses the required NVIDIA NIM model", () => {
    expect(getDefaultModel("nvidia")).toBe("mistralai/mistral-large-4-1t-a52b");
  });

  it("uses the production DeepSeek model catalog", () => {
    expect(getProviderConfig("deepseek").models.map((model) => model.id)).toEqual(["deepseek-flash", "deepseek-v4-pro"]);
  });

  it("defaults Groq to its lower-cost compatible model", () => {
    expect(getDefaultModel("groq")).toBe("openai/gpt-oss-20b");
  });

  it("classifies provider failures without exposing response bodies", () => {
    expect(classifyProviderStatus(401)).toBe("invalid_key");
    expect(classifyProviderStatus(403)).toBe("permission_denied");
    expect(classifyProviderStatus(402)).toBe("quota_exhausted");
    expect(classifyProviderStatus(429)).toBe("rate_limited");
    expect(classifyProviderStatus(404)).toBe("model_unavailable");
    expect(classifyProviderStatus("timeout")).toBe("timeout");
  });
});
