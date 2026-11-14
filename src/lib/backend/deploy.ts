import type { BackendOperationResult, DeployRequest, DeploymentRecord } from "./types";

export interface DeployPrerequisites {
  vercelTokenAvailable: boolean;
  githubRepoAvailable: boolean;
  buildValidated: boolean;
  missing: string[];
}

export function assessDeployPrerequisites(input: { vercelTokenRef?: string; repoFullName?: string; buildValidated?: boolean }): DeployPrerequisites {
  const vercelTokenAvailable = Boolean(input.vercelTokenRef);
  const githubRepoAvailable = Boolean(input.repoFullName);
  const buildValidated = Boolean(input.buildValidated);
  const missing: string[] = [];
  if (!githubRepoAvailable) missing.push("Connected GitHub repository (source) for the generated app");
  if (!buildValidated) missing.push("Successful local/build validation for the generated app before deploy");
  if (!vercelTokenAvailable) missing.push("Vercel deployment token/credentials (server-side) and authorized team/project access");
  missing.push("Provider-confirmed deployment creation/status and live URL from Vercel API (not available in this environment without credentials)");
  return { vercelTokenAvailable, githubRepoAvailable, buildValidated, missing };
}

export async function deployToVercel(req: DeployRequest): Promise<BackendOperationResult<Partial<DeploymentRecord>>> {
  const prereq = assessDeployPrerequisites({ repoFullName: req.repoFullName, buildValidated: false });
  // Never claim deployment succeeded without provider confirmation.
  return {
    ok: false,
    status: "external_prerequisites_required",
    message: "Deployment integration interface is implemented (build validation gate, GitHub source linkage, Vercel deploy/status/logs/env injection/rollback hooks), but no production deployment was performed or provider-confirmed.",
    prerequisites: prereq.missing,
    data: {
      generatedAppId: req.generatedAppId,
      provider: "vercel",
      status: "not_deployed",
      repoFullName: req.repoFullName ?? null,
    },
  };
}

export function deploymentHistoryUnavailable(): BackendOperationResult {
  return { ok: true, status: "local_only", message: "Deployment history is stored in AppiGen backend tables when authenticated and migrations are applied; provider-side history/rollback requires Vercel API credentials." };
}
