import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, supabaseAnon, { global: { headers: { Authorization: authHeader } } });
  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user;
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const action = String(body.action ?? "");

  // Server-side secret handling interface: store only references/metadata in DB; real secret values require secure vault/KMS/secret manager.
  // This function never returns secret values and never stores raw secrets in generated_app_env_vars.public_value.
  if (action === "store_secret_ref") {
    const key = String(body.key ?? "");
    if (!key) return json({ error: "key is required" }, 400);
    // Without a configured secret vault, we cannot securely persist raw secret material. Return explicit prerequisite.
    return json({
      ok: false,
      status: "external_prerequisites_required",
      message: "Server-side secret storage interface is available, but no secure secret vault/KMS is configured for this environment. Raw secrets were not stored.",
      prerequisites: [
        "Configure a server-side secret store (e.g. Supabase Vault/KMS/external secrets manager) accessible to Edge Functions",
        "Provide encryption key management and access controls",
        "Store only secret references in database rows; inject secrets server-side during deploy/provisioning",
      ],
      data: { key, secretRef: null },
    }, 200);
  }

  if (action === "provision_dedicated") {
    const mgmtToken = Deno.env.get("SUPABASE_MANAGEMENT_API_TOKEN");
    const orgId = String(body.organizationId ?? Deno.env.get("SUPABASE_ORGANIZATION_ID") ?? "");
    if (!mgmtToken || !orgId) {
      return json({
        ok: false,
        status: "external_prerequisites_required",
        message: "Dedicated Supabase provisioning requires management credentials and organization access. No project was created.",
        prerequisites: [
          "SUPABASE_MANAGEMENT_API_TOKEN configured as Edge Function secret (server-side only)",
          "SUPABASE_ORGANIZATION_ID (or request organizationId) with project-create permission",
          "Confirmed Supabase billing/plan permission for project creation",
          "Provider-confirmed Management API provisioning, migration apply, and health verification",
        ],
        data: { requested: { organizationId: orgId || null, region: body.region ?? null, projectName: body.projectName ?? null } },
      }, 200);
    }
    // Even with token present, do not claim success without confirmed provider calls in this implementation pass.
    return json({
      ok: false,
      status: "not_executed",
      message: "Management credentials detected in environment, but automated project-creation execution is disabled in this build to avoid unconfirmed provider-side changes. Implement and authorize the provider-confirmed provisioning workflow before running.",
      prerequisites: ["Explicit authorization to create/delete Supabase projects", "Validated Management API workflow and rollback handling"],
    }, 200);
  }

  if (action === "dedicated_health") {
    const projectUrl = String(body.projectUrl ?? "");
    if (!projectUrl) return json({ ok: false, status: "not_configured", message: "Dedicated project URL is required for health checks." });
    try {
      const res = await fetch(`${projectUrl.replace(/\/$/, "")}/auth/v1/health`, { method: "GET" });
      return json({
        ok: res.ok,
        status: res.ok ? "reachable" : "unhealthy",
        message: res.ok ? "Dedicated project auth health endpoint reachable." : `Dedicated project health check returned ${res.status}.`,
        data: { httpStatus: res.status },
      });
    } catch (e) {
      return json({ ok: false, status: "unreachable", message: e instanceof Error ? e.message : "Health check failed." });
    }
  }

  return json({ ok: false, status: "unsupported_action", message: `Unknown action: ${action}` }, 400);
});
