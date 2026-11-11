import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { BackendMode, DeploymentRecord, EnvVarEntry, GeneratedAppBackendConfig, ProvisioningStatus } from "./types";

export interface GeneratedAppRecord {
  id: string;
  owner_id: string;
  appigen_project_id: string | null;
  name: string;
  backend_mode: BackendMode;
  status: string;
  created_at: string;
  updated_at: string;
}

function asBackendMode(value: unknown): BackendMode {
  return value === "dedicated" ? "dedicated" : "shared";
}

function asProvisioningStatus(value: unknown): ProvisioningStatus {
  const allowed: ProvisioningStatus[] = ["not_configured", "configured", "provisioning", "ready", "error", "deleting"];
  return allowed.includes(value as ProvisioningStatus) ? (value as ProvisioningStatus) : "not_configured";
}

export async function ensureGeneratedApp(input: { ownerId: string; appigenProjectId: string | null; name: string; mode: BackendMode }): Promise<GeneratedAppRecord> {
  if (input.appigenProjectId) {
    const { data: existing } = await supabase
      .from("generated_apps")
      .select("*")
      .eq("owner_id", input.ownerId)
      .eq("appigen_project_id", input.appigenProjectId)
      .maybeSingle();
    if (existing) return existing as GeneratedAppRecord;
  }
  const { data, error } = await supabase
    .from("generated_apps")
    .insert({ owner_id: input.ownerId, appigen_project_id: input.appigenProjectId, name: input.name, backend_mode: input.mode, status: "configured" })
    .select("*")
    .single();
  if (error) throw error;
  return data as GeneratedAppRecord;
}

export async function upsertBackendConfig(config: GeneratedAppBackendConfig): Promise<void> {
  const { error } = await supabase.from("generated_app_backend_configs").upsert({
    generated_app_id: config.generatedAppId,
    owner_id: config.ownerId,
    mode: config.mode,
    dedicated_project_ref: config.dedicatedProjectRef ?? null,
    dedicated_project_url: config.dedicatedProjectUrl ?? null,
    dedicated_anon_key_hint: config.dedicatedAnonKeyHint ?? null,
    provisioning_status: config.provisioningStatus,
    provisioning_error: config.provisioningError ?? null,
    last_health_status: config.lastHealthStatus ?? null,
    last_health_checked_at: config.lastHealthCheckedAt ?? null,
    config: (config.config ?? {}) as Json,
  }, { onConflict: "generated_app_id" });
  if (error) throw error;
  await supabase.from("generated_apps").update({ backend_mode: config.mode, status: config.provisioningStatus }).eq("id", config.generatedAppId).eq("owner_id", config.ownerId);
}

export async function loadBackendConfig(generatedAppId: string, ownerId: string): Promise<GeneratedAppBackendConfig | null> {
  const { data, error } = await supabase
    .from("generated_app_backend_configs")
    .select("*")
    .eq("generated_app_id", generatedAppId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    generatedAppId: String(row.generated_app_id),
    ownerId: String(row.owner_id),
    mode: asBackendMode(row.mode),
    provisioningStatus: asProvisioningStatus(row.provisioning_status),
    dedicatedProjectRef: (row.dedicated_project_ref as string | null) ?? null,
    dedicatedProjectUrl: (row.dedicated_project_url as string | null) ?? null,
    dedicatedAnonKeyHint: (row.dedicated_anon_key_hint as string | null) ?? null,
    lastHealthStatus: (row.last_health_status as string | null) ?? null,
    lastHealthCheckedAt: (row.last_health_checked_at as string | null) ?? null,
    provisioningError: (row.provisioning_error as string | null) ?? null,
    config: (row.config as Record<string, unknown>) ?? {},
    updatedAt: (row.updated_at as string | null) ?? null,
  };
}

export async function listEnvVars(generatedAppId: string, ownerId: string): Promise<EnvVarEntry[]> {
  const { data, error } = await supabase
    .from("generated_app_env_vars")
    .select("id,key,is_secret,target,public_value,secret_ref")
    .eq("generated_app_id", generatedAppId)
    .eq("owner_id", ownerId)
    .order("key");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String((row as Record<string, unknown>).id ?? ""),
    key: String((row as Record<string, unknown>).key ?? ""),
    isSecret: Boolean((row as Record<string, unknown>).is_secret),
    target: ((row as Record<string, unknown>).target as EnvVarEntry["target"]) || "runtime",
    publicValue: ((row as Record<string, unknown>).public_value as string | null) ?? null,
    secretRef: ((row as Record<string, unknown>).secret_ref as string | null) ?? null,
  }));
}

export async function upsertEnvVar(generatedAppId: string, ownerId: string, entry: EnvVarEntry): Promise<void> {
  if (entry.isSecret && entry.publicValue) {
    throw new Error("Secret values must not be stored as public environment values.");
  }
  const { error } = await supabase.from("generated_app_env_vars").upsert({
    ...(entry.id ? { id: entry.id } : {}),
    generated_app_id: generatedAppId,
    owner_id: ownerId,
    key: entry.key,
    is_secret: entry.isSecret,
    target: entry.target,
    public_value: entry.isSecret ? null : (entry.publicValue ?? ""),
    secret_ref: entry.isSecret ? (entry.secretRef ?? null) : null,
  }, { onConflict: "generated_app_id,key,target" });
  if (error) throw error;
}

export async function deleteEnvVar(id: string, ownerId: string): Promise<void> {
  const { error } = await supabase.from("generated_app_env_vars").delete().eq("id", id).eq("owner_id", ownerId);
  if (error) throw error;
}

// Shared-backend tenant-isolated CRUD (real DB operations when migrations applied and user authenticated)
export async function sharedCreateRecord(generatedAppId: string, ownerId: string, collection: string, record: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("generated_app_data")
    .insert({ generated_app_id: generatedAppId, owner_id: ownerId, collection, record: record as Json })
    .select("id,collection,record,created_at,updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function sharedListRecords(generatedAppId: string, ownerId: string, collection: string) {
  const { data, error } = await supabase
    .from("generated_app_data")
    .select("id,collection,record,created_at,updated_at")
    .eq("generated_app_id", generatedAppId)
    .eq("owner_id", ownerId)
    .eq("collection", collection)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function sharedUpdateRecord(id: string, generatedAppId: string, ownerId: string, record: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("generated_app_data")
    .update({ record: record as Json })
    .eq("id", id)
    .eq("generated_app_id", generatedAppId)
    .eq("owner_id", ownerId)
    .select("id,collection,record,created_at,updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function sharedDeleteRecord(id: string, generatedAppId: string, ownerId: string) {
  const { error } = await supabase
    .from("generated_app_data")
    .delete()
    .eq("id", id)
    .eq("generated_app_id", generatedAppId)
    .eq("owner_id", ownerId);
  if (error) throw error;
}

export async function listDeployments(generatedAppId: string, ownerId: string): Promise<DeploymentRecord[]> {
  const { data, error } = await supabase
    .from("generated_app_deployments")
    .select("id,generated_app_id,provider,status,repo_full_name,deployment_url,provider_deployment_id,logs,error,created_at")
    .eq("generated_app_id", generatedAppId)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      generatedAppId: String(r.generated_app_id),
      provider: (r.provider as "vercel" | "github") || "vercel",
      status: String(r.status || "pending"),
      repoFullName: (r.repo_full_name as string | null) ?? null,
      deploymentUrl: (r.deployment_url as string | null) ?? null,
      providerDeploymentId: (r.provider_deployment_id as string | null) ?? null,
      logs: (r.logs as string | null) ?? null,
      error: (r.error as string | null) ?? null,
      createdAt: String(r.created_at),
    };
  });
}

export async function createDeploymentRecord(input: Omit<DeploymentRecord, "id" | "createdAt"> & { metadata?: Record<string, unknown> }): Promise<DeploymentRecord> {
  const { data, error } = await supabase
    .from("generated_app_deployments")
    .insert({
      generated_app_id: input.generatedAppId,
      owner_id: (input as { ownerId?: string }).ownerId,
      provider: input.provider,
      status: input.status,
      repo_full_name: input.repoFullName ?? null,
      deployment_url: input.deploymentUrl ?? null,
      provider_deployment_id: input.providerDeploymentId ?? null,
      logs: input.logs ?? null,
      error: input.error ?? null,
      metadata: (input.metadata ?? {}) as Json,
    })
    .select("id,generated_app_id,provider,status,repo_full_name,deployment_url,provider_deployment_id,logs,error,created_at")
    .single();
  if (error) throw error;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    generatedAppId: String(r.generated_app_id),
    provider: (r.provider as "vercel" | "github") || "vercel",
    status: String(r.status || "pending"),
    repoFullName: (r.repo_full_name as string | null) ?? null,
    deploymentUrl: (r.deployment_url as string | null) ?? null,
    providerDeploymentId: (r.provider_deployment_id as string | null) ?? null,
    logs: (r.logs as string | null) ?? null,
    error: (r.error as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}
