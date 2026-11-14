import { dedicatedBackendContext, deleteDedicatedBackend, healthCheckDedicated, provisionDedicatedBackend } from "./dedicatedBackend";
import { healthCheckShared, provisionSharedBackend, sharedBackendContext } from "./sharedBackend";
import type { BackendMode, BackendOperationResult, GeneratedAppBackendConfig, GeneratedBackendContext, ProvisioningRequest } from "./types";

export function getBackendContext(config: Pick<GeneratedAppBackendConfig, "generatedAppId" | "mode" | "dedicatedProjectRef" | "dedicatedProjectUrl" | "dedicatedAnonKeyHint">): GeneratedBackendContext {
  if (config.mode === "dedicated") {
    return dedicatedBackendContext(config.generatedAppId, {
      projectRef: config.dedicatedProjectRef ?? undefined,
      projectUrl: config.dedicatedProjectUrl ?? undefined,
      anonKeyHint: config.dedicatedAnonKeyHint ?? undefined,
    });
  }
  return sharedBackendContext(config.generatedAppId);
}

export async function provisionBackend(req: ProvisioningRequest): Promise<BackendOperationResult> {
  return req.mode === "dedicated" ? provisionDedicatedBackend(req) : provisionSharedBackend(req);
}

export async function deleteBackend(req: ProvisioningRequest): Promise<BackendOperationResult> {
  if (req.mode === "dedicated") return deleteDedicatedBackend(req);
  return { ok: false, status: "not_applicable", message: "Shared backend is platform-managed and cannot be deleted per generated app from this action." };
}

export async function healthCheckBackend(config: GeneratedAppBackendConfig): Promise<BackendOperationResult> {
  if (config.mode === "dedicated") return healthCheckDedicated({ projectUrl: config.dedicatedProjectUrl, projectRef: config.dedicatedProjectRef });
  return healthCheckShared(config.generatedAppId);
}

export function defaultBackendMode(): BackendMode {
  return "shared";
}

export function validateModeSwitch(from: BackendMode, to: BackendMode, opts: { hasData?: boolean; confirmed?: boolean }): BackendOperationResult {
  if (from === to) return { ok: true, status: "noop", message: "Backend mode unchanged." };
  if (opts.hasData && !opts.confirmed) {
    return {
      ok: false,
      status: "confirmation_required",
      message: "Switching backend mode can affect data, auth, storage, realtime, and deployment configuration. Explicit confirmation and migration/data-preservation checks are required before switching.",
      prerequisites: ["Confirm mode switch", "Run migration/data-preservation checks", "Verify target backend readiness"],
    };
  }
  return {
    ok: true,
    status: "allowed_with_checks",
    message: "Mode switch is allowed only after migration/data-preservation checks and target backend verification.",
    prerequisites: ["Provision/connect target backend", "Migrate schema/data as required", "Update environment variables and deployment config", "Run health and integration verification"],
  };
}
