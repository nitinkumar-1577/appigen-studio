export const GENERATION_MODELS = [
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "deepseek-flash",
  "deepseek-v4-pro",
  "openai/gpt-4o-mini",
  "gemini-2.5-flash",
  "gpt-4o-mini",
  "mistralai/mistral-large-4-1t-a52b",
] as const;
export const AI_PROVIDERS = ["groq", "deepseek", "openrouter", "gemini", "openai", "nvidia"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
export const PROVIDER_MODELS: Record<AiProvider, readonly GenerationSettings["model"][]> = {
  groq: ["openai/gpt-oss-20b", "openai/gpt-oss-120b"],
  deepseek: ["deepseek-flash", "deepseek-v4-pro"],
  openrouter: ["openai/gpt-4o-mini"],
  gemini: ["gemini-2.5-flash"],
  openai: ["gpt-4o-mini"],
  nvidia: ["mistralai/mistral-large-4-1t-a52b"],
};

export type AppTheme = "dark" | "light" | "system";
export type UiDensity = "Comfortable" | "Compact" | "Spacious";
export type SafetyCategory = "harassment" | "hate" | "explicit" | "dangerous";

export interface GenerationSettings {
  provider: AiProvider;
  model: (typeof GENERATION_MODELS)[number];
  systemInstructions: string;
  temperature: number;
  topP: number;
  safety: Record<SafetyCategory, number>;
}

export interface AppPreferences {
  theme: AppTheme;
  provider: AiProvider;
  model: (typeof GENERATION_MODELS)[number];
  density: UiDensity;
  autoDraft: boolean;
  telemetry: boolean;
}

export interface ActivityEntry {
  id: string;
  kind: "build" | "edit" | "github" | "prompt";
  title: string;
  detail: string;
  createdAt: number;
  durationMs?: number;
  promptCharacters?: number;
}

export function modelsForProvider(provider: AiProvider): readonly GenerationSettings["model"][] {
  return PROVIDER_MODELS[provider];
}

const PREFERENCES_KEY = "appigen.preferences.v1";
const GENERATION_KEY = "appigen.generation-settings.v1";
const ACTIVITY_PREFIX = "appigen.activity.v1.";

export const DEFAULT_SYSTEM_INSTRUCTIONS =
  "You are an expert product designer and full-stack engineer. Generate clean, accessible, production-ready React + Tailwind code.";

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: "dark",
  provider: "groq",
  model: GENERATION_MODELS[1],
  density: "Comfortable",
  autoDraft: true,
  telemetry: false,
};

export const DEFAULT_GENERATION_SETTINGS: GenerationSettings = {
  provider: "groq",
  model: GENERATION_MODELS[1],
  systemInstructions: DEFAULT_SYSTEM_INSTRUCTIONS,
  temperature: 0.7,
  topP: 0.95,
  safety: { harassment: 2, hate: 2, explicit: 3, dangerous: 2 },
};

function readObject<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? { ...fallback, ...JSON.parse(value) } : fallback;
  } catch {
    return fallback;
  }
}

export function readAppPreferences(): AppPreferences {
  const parsed = readObject<AppPreferences>(PREFERENCES_KEY, DEFAULT_PREFERENCES);
  return {
    ...parsed,
    theme: ["dark", "light", "system"].includes(parsed.theme) ? parsed.theme : "dark",
    provider: AI_PROVIDERS.includes(parsed.provider) ? parsed.provider : "groq",
    model: GENERATION_MODELS.includes(parsed.model) ? parsed.model : DEFAULT_PREFERENCES.model,
    density: ["Comfortable", "Compact", "Spacious"].includes(parsed.density) ? parsed.density : "Comfortable",
  };
}

export function saveAppPreferences(preferences: AppPreferences): void {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

export function applyAppPreferences(preferences: AppPreferences): void {
  const root = document.documentElement;
  root.dataset.theme = preferences.theme === "light" ? "light" : "dark";
  root.dataset.density = preferences.density.toLowerCase();
}

export function readGenerationSettings(): GenerationSettings {
  const parsed = readObject<GenerationSettings>(GENERATION_KEY, DEFAULT_GENERATION_SETTINGS);
  return {
    ...parsed,
    provider: AI_PROVIDERS.includes(parsed.provider) ? parsed.provider : "groq",
    model: GENERATION_MODELS.includes(parsed.model) ? parsed.model : DEFAULT_GENERATION_SETTINGS.model,
    systemInstructions: typeof parsed.systemInstructions === "string"
      ? parsed.systemInstructions.slice(0, 4000)
      : DEFAULT_SYSTEM_INSTRUCTIONS,
    temperature: Number.isFinite(parsed.temperature) ? Math.min(2, Math.max(0, parsed.temperature)) : 0.7,
    topP: Number.isFinite(parsed.topP) ? Math.min(1, Math.max(0, parsed.topP)) : 0.95,
    safety: {
      harassment: clampSafety(parsed.safety?.harassment, 2),
      hate: clampSafety(parsed.safety?.hate, 2),
      explicit: clampSafety(parsed.safety?.explicit, 3),
      dangerous: clampSafety(parsed.safety?.dangerous, 2),
    },
  };
}

export function saveGenerationSettings(settings: GenerationSettings): void {
  localStorage.setItem(GENERATION_KEY, JSON.stringify(settings));
}

export function readActivity(userId: string): ActivityEntry[] {
  try {
    const entries: unknown = JSON.parse(localStorage.getItem(`${ACTIVITY_PREFIX}${userId}`) ?? "[]");
    return Array.isArray(entries)
      ? entries.filter((entry): entry is ActivityEntry =>
        typeof entry === "object" && entry !== null &&
        typeof entry.id === "string" && typeof entry.title === "string" &&
        typeof entry.detail === "string" && typeof entry.createdAt === "number")
      : [];
  } catch {
    return [];
  }
}

export function recordActivity(userId: string, entry: Omit<ActivityEntry, "id" | "createdAt">): ActivityEntry {
  const recorded: ActivityEntry = { ...entry, id: crypto.randomUUID(), createdAt: Date.now() };
  const entries = [recorded, ...readActivity(userId)].slice(0, 100);
  try {
    localStorage.setItem(`${ACTIVITY_PREFIX}${userId}`, JSON.stringify(entries));
  } catch (error) {
    console.warn("Could not cache workspace activity locally:", error);
  }
  window.dispatchEvent(new CustomEvent("appigen:activity", { detail: userId }));
  return recorded;
}

function clampSafety(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(3, Math.max(0, Math.round(value)))
    : fallback;
}
