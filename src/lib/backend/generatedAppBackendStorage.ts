import type { BackendMode, EnvVarEntry, GeneratedAppBackendConfig } from "./types";

const KEY_PREFIX = "appigen.generated-backend.v1.";

function key(projectKey: string) { return `${KEY_PREFIX}${projectKey}`; }

export interface GeneratedBackendState {
  generatedAppId: string;
  mode: BackendMode;
  config: GeneratedAppBackendConfig;
  envVars: EnvVarEntry[];
  updatedAt: number;
}

export function readGeneratedBackendState(projectKey: string): GeneratedBackendState | null {
  try {
    const raw = localStorage.getItem(key(projectKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GeneratedBackendState;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeGeneratedBackendState(projectKey: string, state: GeneratedBackendState) {
  try {
    localStorage.setItem(key(projectKey), JSON.stringify({ ...state, updatedAt: Date.now() }));
  } catch {
    // best-effort
  }
}

export function defaultGeneratedBackendState(projectKey: string): GeneratedBackendState {
  const generatedAppId = projectKey || `local-${crypto.randomUUID()}`;
  return {
    generatedAppId,
    mode: "shared",
    config: {
      generatedAppId,
      ownerId: "local",
      mode: "shared",
      provisioningStatus: "not_configured",
      config: {},
    },
    envVars: [],
    updatedAt: Date.now(),
  };
}
