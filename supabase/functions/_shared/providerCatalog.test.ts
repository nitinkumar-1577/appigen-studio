import { describe, expect, it } from "vitest";
import { ACTIVE_PROVIDER_NAMES, DEFAULT_PROVIDER, PROVIDER_NAMES, classifyProviderStatus, getDefaultModel, getProvider, getProviderConfig } from "./providerCatalog";

describe("provider catalog", () => {
  it("exposes only Groq, NVIDIA, and Gemini", () => {
    expect(PROVIDER_NAMES).toEqual(["groq", "nvidia", "gemini"]);
    expect(ACTIVE_PROVIDER_NAMES).toEqual(PROVIDER_NAMES);
  });
  it("defaults to Groq and rejects legacy providers", () => {
    expect(DEFAULT_PROVIDER).toBe("groq");
    expect(getProvider(undefined)).toBe("groq");
    expect(getProvider("lovable")).toBe("groq");
    expect(getProvider("deepseek")).toBe("groq");
    expect(getProvider("openrouter")).toBe("groq");
    expect(getProvider("openai")).toBe("groq");
  });
  it("uses the expected model and server secret for each active provider", () => {
    expect(getProviderConfig("groq").secretNames).toContain("GROQ_API_KEY");
    expect(getProviderConfig("nvidia").secretNames).toContain("NVIDIA_API_KEY");
    expect(getProviderConfig("gemini").secretNames).toContain("GEMINI_API_KEY");
    expect(getDefaultModel("groq")).toBe("openai/gpt-oss-20b");
    expect(getDefaultModel("nvidia")).toBe("nvidia/nemotron-3.5-lightning-30b-a3b");
    expect(getProviderConfig("nvidia").models.map((model) => model.id)).toContain("nvidia/llama-3.1-nemotron-51b-instruct");
    expect(getProviderConfig("nvidia").models.map((model) => model.id)).toContain("nvidia/nemotron-4-340b-instruct");
    expect(getDefaultModel("gemini")).toBe("gemini-3.8-flash");
    expect(getProviderConfig("gemini").models.map((model) => model.id)).toContain("gemini-2.5-flash");
  });
  it("classifies common provider failures", () => {
    expect(classifyProviderStatus(401)).toBe("invalid_key");
    expect(classifyProviderStatus(403)).toBe("permission_denied");
    expect(classifyProviderStatus(402)).toBe("quota_exhausted");
    expect(classifyProviderStatus(429)).toBe("rate_limited");
    expect(classifyProviderStatus(404)).toBe("model_unavailable");
    expect(classifyProviderStatus("timeout")).toBe("timeout");
  });
});
