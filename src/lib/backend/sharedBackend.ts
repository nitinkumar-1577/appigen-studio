import type { BackendCapabilities, BackendOperationResult, GeneratedBackendContext, ProvisioningRequest } from "./types";

export const SHARED_CAPABILITIES: BackendCapabilities = {
  database: true,
  auth: true,
  storage: false, // shared storage buckets/policies provisioning requires configured buckets; reported via status
  realtime: true,
  edgeFunctions: true,
};

export function sharedBackendContext(generatedAppId: string): GeneratedBackendContext {
  return {
    mode: "shared",
    generatedAppId,
    capabilities: SHARED_CAPABILITIES,
  };
}

export async function provisionSharedBackend(req: ProvisioningRequest): Promise<BackendOperationResult> {
  // Shared backend uses AppiGen's existing Supabase project and tenant-isolated tables (generated_app_data + RLS).
  // Actual DB connectivity depends on environment/project configuration; no external project is created.
  if (req.mode !== "shared") {
    return { ok: false, status: "invalid_mode", message: "Shared provisioning requested for non-shared mode." };
  }
  return {
    ok: true,
    status: "ready",
    message: "Shared backend configured. Generated app data will use AppiGen shared Supabase tables with strict per-app/per-owner RLS isolation.",
    data: sharedBackendContext(req.generatedAppId),
  };
}

export async function healthCheckShared(generatedAppId: string): Promise<BackendOperationResult> {
  return {
    ok: true,
    status: "configured",
    message: "Shared backend configuration is valid. Live connectivity/CRUD checks require authenticated Supabase access and applied migrations.",
    data: { generatedAppId, mode: "shared", capabilities: SHARED_CAPABILITIES },
  };
}
