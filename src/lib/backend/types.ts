import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database as GeneratedDatabase, Json } from "@/integrations/supabase/types";

type RuntimeTable<
  Row extends Record<string, unknown>,
  Insert extends Record<string, unknown>,
> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Row>;
  Relationships: [];
};

type AppigenRuntimeTables = {
  generated_apps: RuntimeTable<
    { id: string; owner_id: string; appigen_project_id: string | null; name: string; backend_mode: string; status: string; created_at: string; updated_at: string },
    { id?: string; owner_id: string; appigen_project_id: string | null; name?: string; backend_mode: string; status?: string; created_at?: string; updated_at?: string }
  >;
  generated_app_backend_configs: RuntimeTable<
    { id: string; generated_app_id: string; owner_id: string; mode: string; dedicated_project_ref: string | null; dedicated_project_url: string | null; dedicated_anon_key_hint: string | null; provisioning_status: string; provisioning_error: string | null; last_health_status: string | null; last_health_checked_at: string | null; config: Json; created_at: string; updated_at: string },
    { id?: string; generated_app_id: string; owner_id: string; mode: string; dedicated_project_ref?: string | null; dedicated_project_url?: string | null; dedicated_anon_key_hint?: string | null; provisioning_status?: string; provisioning_error?: string | null; last_health_status?: string | null; last_health_checked_at?: string | null; config?: Json; created_at?: string; updated_at?: string }
  >;
  generated_app_env_vars: RuntimeTable<
    { id: string; generated_app_id: string; owner_id: string; key: string; is_secret: boolean; public_value: string | null; secret_ref: string | null; target: string; created_at: string; updated_at: string },
    { id?: string; generated_app_id: string; owner_id: string; key: string; is_secret: boolean; public_value?: string | null; secret_ref?: string | null; target: string; created_at?: string; updated_at?: string }
  >;
  generated_app_deployments: RuntimeTable<
    { id: string; generated_app_id: string; owner_id: string; provider: string; status: string; repo_full_name: string | null; deployment_url: string | null; provider_deployment_id: string | null; logs: string | null; error: string | null; metadata: Json; created_at: string; updated_at: string },
    { id?: string; generated_app_id: string; owner_id: string; provider: string; status: string; repo_full_name?: string | null; deployment_url?: string | null; provider_deployment_id?: string | null; logs?: string | null; error?: string | null; metadata?: Json; created_at?: string; updated_at?: string }
  >;
  generated_app_data: RuntimeTable<
    { id: string; generated_app_id: string; owner_id: string; collection: string; record: Json; created_at: string; updated_at: string },
    { id?: string; generated_app_id: string; owner_id: string; collection: string; record?: Json; created_at?: string; updated_at?: string }
  >;
  user_settings: RuntimeTable<
    { user_id: string; app_preferences: Json; generation_settings: Json; accent_color: string | null; updated_at: string },
    { user_id: string; app_preferences: Json; generation_settings: Json; accent_color?: string | null; updated_at?: string }
  >;
};

type AppigenRuntimeFunctions = {
  get_appigen_usage_metrics: {
    Args: Record<PropertyKey, never>;
    Returns: { apps_created: number; prompt_characters: number; average_build_time_ms: number | null; completed_builds: number }[];
  };
};

export type AppigenRuntimeDatabase = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedDatabase["public"], "Tables" | "Functions"> & {
    Tables: GeneratedDatabase["public"]["Tables"] & AppigenRuntimeTables;
    Functions: GeneratedDatabase["public"]["Functions"] & AppigenRuntimeFunctions;
  };
};

export const asAppigenRuntimeClient = (
  client: SupabaseClient<GeneratedDatabase>,
): SupabaseClient<AppigenRuntimeDatabase> =>
  client as unknown as SupabaseClient<AppigenRuntimeDatabase>;

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
