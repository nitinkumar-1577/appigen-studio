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
  const action = String(body.action ?? "deploy");

  const vercelToken = Deno.env.get("VERCEL_TOKEN");
  const hasBuildValidation = Boolean(body.buildValidated);
  const repo = typeof body.repoFullName === "string" ? body.repoFullName : "";

  // GitHub source push is handled client-side via existing GithubModal; deployment requires provider credentials and confirmation.
  if (action === "deploy" || action === "redeploy") {
    if (!repo) return json({ ok: false, status: "missing_prerequisite", message: "GitHub repository is required for deployment.", prerequisites: ["Connect/push source to a GitHub repository"] });
    if (!hasBuildValidation) return json({ ok: false, status: "validation_required", message: "Generated app must pass build/validation before deployment.", prerequisites: ["Run and pass build validation"] });
    if (!vercelToken) {
      return json({
        ok: false,
        status: "external_prerequisites_required",
        message: "Vercel deployment interface is implemented, but no provider-confirmed deployment was performed (VERCEL_TOKEN not configured).",
        prerequisites: [
          "Configure VERCEL_TOKEN as server-side Edge Function secret (never in frontend)",
          "Authorize Vercel team/project and GitHub integration",
          "Provider-confirmed deployment creation, status polling, logs, and live URL retrieval",
          "Inject environment variables server-side via Vercel API",
        ],
        data: { provider: "vercel", repoFullName: repo, status: "not_deployed" },
      });
    }
    return json({
      ok: false,
      status: "not_executed",
      message: "VERCEL_TOKEN detected, but automated provider deployment execution is disabled in this build to avoid unconfirmed/unauthorized production changes. Execute only with explicit authorization and provider confirmation.",
      prerequisites: ["Explicit authorization to deploy", "Provider-confirmed Vercel API workflow"],
    });
  }

  if (action === "status" || action === "logs" || action === "history" || action === "rollback") {
    return json({
      ok: false,
      status: "external_prerequisites_required",
      message: `Deployment ${action} requires provider API credentials and a known deployment ID. No provider state was modified.`,
      prerequisites: ["VERCEL_TOKEN server-side secret", "Provider deployment ID from confirmed deployment", "Authorized Vercel project access"],
    });
  }

  return json({ ok: false, status: "unsupported_action", message: `Unknown action: ${action}` }, 400);
});
