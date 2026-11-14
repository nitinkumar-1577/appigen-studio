export const PROVIDER_NAMES = ["groq", "nvidia", "gemini"] as const;
export const ACTIVE_PROVIDER_NAMES = PROVIDER_NAMES;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export type ProviderStatus =
  | "working"
  | "missing"
  | "invalid_key"
  | "permission_denied"
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
      { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B", default: true },
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
    ],
    supportsModelListing: true,
    protocol: "openai",
  },


  gemini: {
    name: "gemini",
    label: "Gemini",
    secretNames: ["GEMINI_API_KEY"],
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: [
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", default: true },
      { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
    ],
    supportsModelListing: true,
    protocol: "gemini",
  },

  nvidia: {
    name: "nvidia",
    label: "NVIDIA NIM",
    secretNames: ["NVIDIA_API_KEY"],
    baseUrl: "https://integrate.api.nvidia.com/v1",
    models: [
      { id: "nvidia/nemotron-3.5-lightning-30b-a3b", label: "Nemotron 3.5 Lightning 30B", default: true },
      { id: "nvidia/llama-3.1-nemotron-51b-instruct", label: "Nemotron 51B" },
      { id: "nvidia/nemotron-4-340b-instruct", label: "Nemotron 4 340B" },
      { id: "nvidia/mistral-nemo-minitron-8b-8k-instruct", label: "Mistral Nemo Minitron 8B" },
    ],
    supportsModelListing: true,
    protocol: "openai",
  },
};

export const DEFAULT_PROVIDER: ProviderName = "groq";

export function getProvider(value: unknown): ProviderName {
  return ACTIVE_PROVIDER_NAMES.includes(value as ProviderName) ? value as ProviderName : DEFAULT_PROVIDER;
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
  if (status === 401) return "invalid_key";
  if (status === 403) return "permission_denied";
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
