export const PROVIDER_NAMES = ["groq", "deepseek", "openrouter", "gemini", "openai", "nvidia"] as const;
export const ACTIVE_PROVIDER_NAMES = ["groq"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export type ProviderStatus =
  | "working"
  | "missing"
  | "invalid_key"
  | "quota_exhausted"
  | "rate_limited"
  | "model_unavailable"
  | "timeout"
  | "network_error"
  | "request_error";

export interface ProviderModel {
  id: string;
  label: string;
  default?: boolean;
}

export interface ProviderConfig {
  name: ProviderName;
  label: string;
  secretNames: readonly string[];
  baseUrl: string;
  models: readonly ProviderModel[];
  supportsModelListing: boolean;
  protocol: "openai" | "gemini";
}

export const PROVIDER_CATALOG: Record<ProviderName, ProviderConfig> = {
  groq: {
    name: "groq",
    label: "Groq",
    secretNames: ["GROQ_API_KEY"],
    baseUrl: "https://api.groq.com/openai/v1",
    models: [
      { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B" },
      { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B" },
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", default: true },
    ],
    supportsModelListing: true,
    protocol: "openai",
  },
  deepseek: {
    name: "deepseek",
    label: "DeepSeek",
    secretNames: ["DEEPSEEK-API-KEY", "DEEPSEEK_API_KEY"],
    baseUrl: "https://api.deepseek.com",
    models: [{ id: "deepseek-chat", label: "DeepSeek Chat", default: true }],
    supportsModelListing: true,
    protocol: "openai",
  },
  openrouter: {
    name: "openrouter",
    label: "OpenRouter",
    secretNames: ["OPENROUTER_API_KEY"],
    baseUrl: "https://openrouter.ai/api/v1",
    models: [{ id: "openai/gpt-4o-mini", label: "OpenAI GPT-4o Mini", default: true }],
    supportsModelListing: true,
    protocol: "openai",
  },
  gemini: {
    name: "gemini",
    label: "Gemini",
    secretNames: ["GEMINI_API_KEY"],
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: [{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", default: true }],
    supportsModelListing: true,
    protocol: "gemini",
  },
  openai: {
    name: "openai",
    label: "OpenAI",
    secretNames: ["OPENAI_API_KEY"],
    baseUrl: "https://api.openai.com/v1",
    models: [{ id: "gpt-4o-mini", label: "GPT-4o Mini", default: true }],
    supportsModelListing: true,
    protocol: "openai",
  },
  nvidia: {
    name: "nvidia",
    label: "NVIDIA NIM",
    secretNames: ["NVIDIA_API_KEY"],
    baseUrl: "https://integrate.api.nvidia.com/v1",
    models: [
      { id: "mistralai/mistral-large-4-1t-a52b", label: "Mistral Large 4 1T A52B", default: true },
    ],
    supportsModelListing: true,
    protocol: "openai",
  },
};

export function getProvider(value: unknown): ProviderName {
  return PROVIDER_NAMES.includes(value as ProviderName) ? value as ProviderName : "groq";
}

export function getProviderConfig(provider: ProviderName): ProviderConfig {
  return PROVIDER_CATALOG[provider];
}

export function getDefaultModel(provider: ProviderName): string {
  return getProviderConfig(provider).models.find((model) => model.default)?.id
    ?? getProviderConfig(provider).models[0].id;
}

export function classifyProviderStatus(status: number | "timeout" | "network"): ProviderStatus {
  if (status === "timeout") return "timeout";
  if (status === "network") return "network_error";
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 402) return "quota_exhausted";
  if (status === 429) return "rate_limited";
  if (status === 404) return "model_unavailable";
  if (status >= 500) return "network_error";
  if (status >= 400) return "request_error";
  return "working";
}

export function secretNamesFor(provider: ProviderName): readonly string[] {
  return getProviderConfig(provider).secretNames;
}
