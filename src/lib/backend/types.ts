export type BackendMode = "shared" | "dedicated";

export type ProvisioningStatus =
  | "not_configured"
  | "configured"
  | "provisioning"
  | "ready"
  | "error"
  | "deleting";

export interface GeneratedAppBackendConfig {
  generatedAppId: string;
  ownerId: string;
  mode: BackendMode;
  provisioningStatus: ProvisioningStatus;
  dedicatedProjectRef?: string | null;
  dedicatedProjectUrl?: string | null;
  dedicatedAnonKeyHint?: string | null;
  lastHealthStatus?: string | null;
  lastHealthCheckedAt?: string | null;
  provisioningError?: string | null;
  config: Record<string, unknown>;
  updatedAt?: string | null;
}

export interface EnvVarEntry {
  id?: string;
  key: string;
  isSecret: boolean;
  target: "runtime" | "build" | "both";
  publicValue?: string | null;
  secretRef?: string | null;
}

export interface DeploymentRecord {
  id: string;
  generatedAppId: string;
  provider: "vercel" | "github";
  status: string;
  repoFullName?: string | null;
  deploymentUrl?: string | null;
  providerDeploymentId?: string | null;
  logs?: string | null;
  error?: string | null;
  createdAt: string;
}

export interface BackendCapabilities {
  database: boolean;
  auth: boolean;
  storage: boolean;
  realtime: boolean;
  edgeFunctions: boolean;
}

export interface BackendOperationResult<T = unknown> {
  ok: boolean;
  status: string;
  message: string;
  data?: T;
  prerequisites?: string[];
}

export interface GeneratedBackendContext {
  mode: BackendMode;
  // Shared: tenant key used with AppiGen shared tables/functions (app-scoped). Dedicated: project connection metadata (no secrets).
  generatedAppId: string;
  projectUrl?: string;
  anonKeyHint?: string;
  projectRef?: string;
  capabilities: BackendCapabilities;
}

export interface ProvisioningRequest {
  generatedAppId: string;
  ownerId: string;
  mode: BackendMode;
  // Dedicated mode inputs (provided by user/operator) - never persisted as plaintext secrets in frontend DB rows.
  supabaseAccessTokenRef?: string;
  organizationId?: string;
  region?: string;
  projectName?: string;
  confirmDestructive?: boolean;
}

export interface DeployRequest {
  generatedAppId: string;
  ownerId: string;
  provider: "vercel";
  repoFullName?: string;
  branch?: string;
  envKeys?: string[];
  redeploy?: boolean;
}
