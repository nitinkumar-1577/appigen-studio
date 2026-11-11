import type { BackendCapabilities, BackendOperationResult, GeneratedBackendContext, ProvisioningRequest } from "./types";

export const DEDICATED_CAPABILITIES: BackendCapabilities = {
  database: true,
  auth: true,
  storage: true,
  realtime: true,
  edgeFunctions: true,
};

export interface DedicatedPrerequisites {
  hasManagementApiAccess: boolean;
  hasOrganizationId: boolean;
  hasBillingPermission: boolean;
  missing: string[];
}

export function assessDedicatedPrerequisites(input: {
  hasAccessToken?: boolean;
  organizationId?: string;
}): DedicatedPrerequisites {
  const hasManagementApiAccess = Boolean(input.hasAccessToken);
  const hasOrganizationId = Boolean(input.organizationId?.trim());
  // Billing/plan permission cannot be verified client-side without provider confirmation.
  const hasBillingPermission = false;
  const missing: string[] = [];
  if (!hasManagementApiAccess) missing.push("Supabase Management API access token (server-side, never exposed to frontend)");
  if (!hasOrganizationId) missing.push("Supabase organization ID/slug with permission to create projects");
  missing.push("Confirmed Supabase billing/plan permission for project creation in the target organization");
  missing.push("Provider-confirmed project provisioning call and post-provision health verification");
  return { hasManagementApiAccess, hasOrganizationId, hasBillingPermission, missing };
}

export function dedicatedBackendContext(generatedAppId: string, meta?: { projectUrl?: string; projectRef?: string; anonKeyHint?: string }): GeneratedBackendContext {
  return {
    mode: "dedicated",
    generatedAppId,
    projectUrl: meta?.projectUrl,
    projectRef: meta?.projectRef,
    anonKeyHint: meta?.anonKeyHint,
    capabilities: DEDICATED_CAPABILITIES,
  };
}

export async function provisionDedicatedBackend(req: ProvisioningRequest): Promise<BackendOperationResult> {
  const prereq = assessDedicatedPrerequisites({
    hasAccessToken: Boolean(req.supabaseAccessTokenRef),
    organizationId: req.organizationId,
  });
  // Never fake provider-confirmed provisioning.
  return {
    ok: false,
    status: "external_prerequisites_required",
    message: "Dedicated Supabase provisioning interface is implemented, but provider-side project creation cannot be confirmed without required credentials and permissions.",
    data: {
      generatedAppId: req.generatedAppId,
      mode: "dedicated",
      requested: {
        organizationId: req.organizationId ?? null,
        region: req.region ?? null,
        projectName: req.projectName ?? null,
      },
      prerequisites: prereq,
      integrationInterface: {
        endpoint: "Supabase Management API (server-side proxy/edge function required)",
        operations: ["create project", "poll provisioning status", "retrieve project API settings", "apply migrations", "configure auth/storage/realtime/functions", "health verification", "delete/cleanup with confirmation"],
        security: "Management token and service credentials must remain server-side; frontend receives status/metadata only.",
      },
    },
    prerequisites: prereq.missing,
  };
}

export async function deleteDedicatedBackend(req: ProvisioningRequest): Promise<BackendOperationResult> {
  if (!req.confirmDestructive) {
    return { ok: false, status: "confirmation_required", message: "Explicit confirmation is required before deleting a dedicated backend/project." };
  }
  const prereq = assessDedicatedPrerequisites({ hasAccessToken: Boolean(req.supabaseAccessTokenRef), organizationId: req.organizationId });
  return {
    ok: false,
    status: "external_prerequisites_required",
    message: "Dedicated backend deletion/cleanup requires provider management credentials and provider-confirmed execution. No deletion performed.",
    prerequisites: prereq.missing,
    data: { generatedAppId: req.generatedAppId, mode: "dedicated", action: "delete", confirmed: true },
  };
}

export async function healthCheckDedicated(config: { projectUrl?: string | null; projectRef?: string | null }): Promise<BackendOperationResult> {
  if (!config.projectUrl && !config.projectRef) {
    return { ok: false, status: "not_configured", message: "Dedicated backend is not connected/provisioned for this app." };
  }
  return {
    ok: false,
    status: "unverified",
    message: "Dedicated backend metadata is present, but live health/connection verification requires reachable project credentials and provider-accessible checks (not executed here).",
    data: { projectUrl: config.projectUrl ?? null, projectRef: config.projectRef ?? null },
  };
}
