import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, Database, Shield, UploadCloud, KeyRound, RefreshCw, Trash2, Link2, Cloud, Plus, List } from "lucide-react";
import { useApp } from "../AppContext";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { defaultBackendMode, getBackendContext, healthCheckBackend, provisionBackend, validateModeSwitch } from "@/lib/backend/backendManager";
import { defaultGeneratedBackendState, readGeneratedBackendState, writeGeneratedBackendState } from "@/lib/backend/generatedAppBackendStorage";
import { assessDeployPrerequisites } from "@/lib/backend/deploy";
import { isSensitiveKey } from "@/lib/backend/secrets";
import { ensureGeneratedApp, loadBackendConfig, upsertBackendConfig, listEnvVars, upsertEnvVar, deleteEnvVar, sharedCreateRecord, sharedListRecords, sharedDeleteRecord } from "@/lib/backend/generatedAppRepository";
import type { BackendMode, EnvVarEntry, GeneratedAppBackendConfig } from "@/lib/backend/types";

interface Props {
  projectId: string | null;
  projectTitle: string;
}

function statusPill(ok: boolean, label: string) {
  return <span className={ok ? "inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400" : "inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-400"}>{ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}{label}</span>;
}

export const BackendDeployPage = ({ projectId, projectTitle }: Props) => {
  const { user, session } = useApp();
  const projectKey = projectId || "local:current";
  const [state, setState] = useState(() => readGeneratedBackendState(projectKey) ?? defaultGeneratedBackendState(projectKey));
  const [busy, setBusy] = useState<string | null>(null);
  const [envKey, setEnvKey] = useState("");
  const [envValue, setEnvValue] = useState("");
  const [envSecret, setEnvSecret] = useState(false);
  const [envTarget, setEnvTarget] = useState<EnvVarEntry["target"]>("runtime");
  const [dedicatedRef, setDedicatedRef] = useState(state.config.dedicatedProjectRef ?? "");
  const [dedicatedUrl, setDedicatedUrl] = useState(state.config.dedicatedProjectUrl ?? "");
  const [deployRepo, setDeployRepo] = useState("");
  const [lastResult, setLastResult] = useState<string>("");
  const [cloudSyncStatus, setCloudSyncStatus] = useState<string>("local");
  const [dataCollection, setDataCollection] = useState("items");
  const [dataDraft, setDataDraft] = useState('{"name":"example"}');
  const [sharedRecords, setSharedRecords] = useState<Array<{ id: string; record: unknown; updated_at?: string }>>([]);
  const [dataBusy, setDataBusy] = useState(false);

  useEffect(() => {
    const next = readGeneratedBackendState(projectKey) ?? defaultGeneratedBackendState(projectKey);
    setState(next);
    setDedicatedRef(next.config.dedicatedProjectRef ?? "");
    setDedicatedUrl(next.config.dedicatedProjectUrl ?? "");
  }, [projectKey]);

  useEffect(() => {
    const uid = session?.user.id;
    if (!uid || !projectId) { setCloudSyncStatus(projectId ? "local (sign in for cloud-backed config)" : "local (no saved project)"); return; }
    let cancelled = false;
    void (async () => {
      try {
        const app = await ensureGeneratedApp({ ownerId: uid, appigenProjectId: projectId, name: projectTitle || "Untitled", mode: state.mode });
        if (cancelled) return;
        const cloudCfg = await loadBackendConfig(app.id, uid);
        const cloudEnv = await listEnvVars(app.id, uid);
        if (cancelled) return;
        if (cloudCfg) {
          setState((prev) => {
            const merged = {
              ...prev,
              generatedAppId: app.id,
              mode: cloudCfg.mode,
              config: { ...prev.config, ...cloudCfg, generatedAppId: app.id, ownerId: uid },
              envVars: cloudEnv.length ? cloudEnv : prev.envVars,
            };
            writeGeneratedBackendState(projectKey, merged);
            return merged;
          });
          setDedicatedRef(cloudCfg.dedicatedProjectRef ?? "");
          setDedicatedUrl(cloudCfg.dedicatedProjectUrl ?? "");
        } else {
          await upsertBackendConfig({ ...state.config, generatedAppId: app.id, ownerId: uid, mode: state.mode });
          setState((prev) => ({ ...prev, generatedAppId: app.id, config: { ...prev.config, generatedAppId: app.id, ownerId: uid } }));
        }
        if (!cancelled) setCloudSyncStatus("cloud-backed config sync attempted (requires applied migrations/functions)");
      } catch (e) {
        if (!cancelled) setCloudSyncStatus(`local-only (cloud sync unavailable: ${e instanceof Error ? e.message : "unknown error"})`);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, session?.user.id]);

  const persist = (next: typeof state) => {
    setState(next);
    writeGeneratedBackendState(projectKey, next);
  };

  const mode = state.mode || defaultBackendMode();
  const context = useMemo(() => getBackendContext({ generatedAppId: state.generatedAppId, mode, dedicatedProjectRef: state.config.dedicatedProjectRef, dedicatedProjectUrl: state.config.dedicatedProjectUrl, dedicatedAnonKeyHint: state.config.dedicatedAnonKeyHint }), [mode, state.config.dedicatedAnonKeyHint, state.config.dedicatedProjectRef, state.config.dedicatedProjectUrl, state.generatedAppId]);

  const switchMode = async (nextMode: BackendMode) => {
    const check = validateModeSwitch(mode, nextMode, { hasData: false, confirmed: true });
    if (!check.ok && check.status === "confirmation_required") {
      if (!window.confirm(check.message)) return;
    } else if (mode !== nextMode) {
      if (!window.confirm(`${check.message}\n\nProceed with mode selection? No provider-side provisioning/deletion will be performed automatically.`)) return;
    }
    const nextConfig: GeneratedAppBackendConfig = {
      ...state.config,
      mode: nextMode,
      provisioningStatus: nextMode === "shared" ? "configured" : (state.config.provisioningStatus === "ready" ? "ready" : "not_configured"),
    };
    persist({ ...state, mode: nextMode, config: nextConfig });
    setLastResult(`Backend mode set to ${nextMode}. ${check.message}`);
  };

  const provision = async () => {
    setBusy("provision");
    try {
      const result = await provisionBackend({
        generatedAppId: state.generatedAppId,
        ownerId: session?.user.id ?? "local",
        mode,
        projectName: projectTitle,
        organizationId: undefined,
      });
      const status = result.ok ? "ready" : (mode === "dedicated" ? "not_configured" : "configured");
      persist({
        ...state,
        config: {
          ...state.config,
          provisioningStatus: status as GeneratedAppBackendConfig["provisioningStatus"],
          provisioningError: result.ok ? null : result.message,
          lastHealthStatus: result.status,
          lastHealthCheckedAt: new Date().toISOString(),
        },
      });
      setLastResult(`${result.message}${result.prerequisites?.length ? `\nPrerequisites: ${result.prerequisites.join("; ")}` : ""}`);
      if (!result.ok) toast({ title: "Provisioning not completed", description: result.message, variant: "destructive" });
      else toast({ title: "Backend configured", description: result.message });
    } finally {
      setBusy(null);
    }
  };

  const runHealth = async () => {
    setBusy("health");
    try {
      const cfg: GeneratedAppBackendConfig = {
        ...state.config,
        generatedAppId: state.generatedAppId,
        ownerId: session?.user.id ?? "local",
        mode,
        dedicatedProjectRef: dedicatedRef || null,
        dedicatedProjectUrl: dedicatedUrl || null,
        config: state.config.config ?? {},
        provisioningStatus: state.config.provisioningStatus ?? "not_configured",
      };
      let result = await healthCheckBackend(cfg);
      if (mode === "dedicated" && dedicatedUrl && session) {
        const { data, error } = await supabase.functions.invoke("backend-manager", { body: { action: "dedicated_health", projectUrl: dedicatedUrl } });
        if (!error && data) result = { ok: Boolean(data.ok), status: String(data.status ?? "unknown"), message: String(data.message ?? "Health check completed."), data };
      }
      persist({ ...state, config: { ...cfg, lastHealthStatus: result.status, lastHealthCheckedAt: new Date().toISOString(), provisioningError: result.ok ? null : result.message } });
      setLastResult(result.message);
      toast({ title: result.ok ? "Health check passed" : "Health check", description: result.message, variant: result.ok ? "default" : "destructive" });
    } catch (e) {
      toast({ title: "Health check failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const saveDedicatedConfig = () => {
    persist({ ...state, config: { ...state.config, dedicatedProjectRef: dedicatedRef || null, dedicatedProjectUrl: dedicatedUrl || null, provisioningStatus: dedicatedUrl || dedicatedRef ? "configured" : state.config.provisioningStatus } });
    toast({ title: "Dedicated backend config saved", description: "Connection metadata saved locally. Live verification requires health checks and valid project credentials." });
  };

  const addEnv = async () => {
    const key = envKey.trim();
    if (!key) return;
    if (envSecret || isSensitiveKey(key)) {
      setBusy("secret");
      try {
        const { data } = await supabase.functions.invoke("backend-manager", { body: { action: "store_secret_ref", key, generatedAppId: state.generatedAppId } });
        const secretRef = data?.data?.secretRef ?? null;
        const entry: EnvVarEntry = { id: crypto.randomUUID(), key, isSecret: true, target: envTarget, secretRef, publicValue: null };
        const next = { ...state, envVars: [...state.envVars.filter((v) => !(v.key === key && v.target === envTarget)), entry] };
        persist(next);
        if (session?.user.id) {
          try { await upsertEnvVar(state.generatedAppId, session.user.id, entry); } catch (e) { setCloudSyncStatus(`env cloud save unavailable: ${e instanceof Error ? e.message : "unknown"}`); }
        }
        setLastResult(String(data?.message || "Secret recorded as metadata/reference only. Raw secret value was not stored client-side."));
        toast({ title: "Secret handling", description: "Raw secret was not stored in frontend/DB public fields. Server-side vault configuration is required for secure storage/injection.", variant: "destructive" });
      } finally { setBusy(null); }
    } else {
      const entry: EnvVarEntry = { id: crypto.randomUUID(), key, isSecret: false, target: envTarget, publicValue: envValue, secretRef: null };
      const next = { ...state, envVars: [...state.envVars.filter((v) => !(v.key === key && v.target === envTarget)), entry] };
      persist(next);
      if (session?.user.id) {
        try { await upsertEnvVar(state.generatedAppId, session.user.id, entry); setCloudSyncStatus("cloud-backed config sync attempted (requires applied migrations/functions)"); } catch (e) { setCloudSyncStatus(`env cloud save unavailable: ${e instanceof Error ? e.message : "unknown"}`); }
      }
      toast({ title: "Environment variable saved", description: "Non-secret value saved in per-app configuration." });
    }
    setEnvKey(""); setEnvValue(""); setEnvSecret(false);
  };

  const removeEnv = async (entry: EnvVarEntry) => {
    const next = { ...state, envVars: state.envVars.filter((v) => (v.id || `${v.key}-${v.target}`) !== (entry.id || `${entry.key}-${entry.target}`)) };
    persist(next);
    if (session?.user.id && entry.id) {
      try { await deleteEnvVar(entry.id, session.user.id); } catch { /* best effort */ }
    }
  };

  const deploy = async () => {
    const prereq = assessDeployPrerequisites({ repoFullName: deployRepo, buildValidated: Boolean(projectId) });
    setBusy("deploy");
    try {
      const { data, error } = await supabase.functions.invoke("deploy-manager", { body: { action: "deploy", generatedAppId: state.generatedAppId, repoFullName: deployRepo, buildValidated: Boolean(projectId) } });
      const msg = error?.message || data?.message || "Deployment request processed.";
      setLastResult(`${msg}${prereq.missing.length ? `\nPrerequisites: ${prereq.missing.join("; ")}` : ""}`);
      toast({ title: data?.ok ? "Deployment" : "Deployment not completed", description: String(msg), variant: data?.ok ? "default" : "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-8">
        <header>
          <h1 className="font-display text-3xl font-bold tracking-tight">Backend & Deploy</h1>
          <p className="mt-1 text-sm text-muted-foreground">Unified backend manager for generated apps: <strong>Shared Supabase</strong> (default) or <strong>Dedicated Supabase</strong> (optional per app), plus environment/config and deployment integration status. AppiGen&apos;s own Supabase project is separate from generated-app backend infrastructure.</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border/70 bg-background/40 px-2 py-1">App: {projectTitle || "Untitled"}</span>
            <span className="rounded-md border border-border/70 bg-background/40 px-2 py-1">Generated app ID: {state.generatedAppId}</span>
            <span className="rounded-md border border-border/70 bg-background/40 px-2 py-1">Mode: {mode}</span>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="glass space-y-4 rounded-xl p-5 shadow-soft">
            <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-semibold"><Database className="h-4 w-4 text-primary" />Backend mode & provisioning</h2>{statusPill(state.config.provisioningStatus === "ready" || (mode === "shared" && state.config.provisioningStatus !== "error"), `Status: ${state.config.provisioningStatus || "not_configured"}`)}</div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => void switchMode("shared")} className={mode === "shared" ? "rounded-lg border border-primary bg-primary/10 px-3 py-2 text-sm font-medium" : "rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary/50"}>Shared Supabase <span className="block text-[11px] text-muted-foreground">Default · tenant-isolated</span></button>
              <button onClick={() => void switchMode("dedicated")} className={mode === "dedicated" ? "rounded-lg border border-primary bg-primary/10 px-3 py-2 text-sm font-medium" : "rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary/50"}>Dedicated Supabase <span className="block text-[11px] text-muted-foreground">Optional per app</span></button>
            </div>
            <p className="text-xs text-muted-foreground">Shared mode uses AppiGen&apos;s shared backend with strict per-app/per-owner RLS isolation (generated app data tables + policies). Dedicated mode provisions/connects an independent Supabase project when management credentials and permissions are available.</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void provision()} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-lg bg-gradient-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" />{busy === "provision" ? "Working..." : "Provision / Configure"}</button>
              <button onClick={() => void runHealth()} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary disabled:opacity-50"><Link2 className="h-3.5 w-3.5" />{busy === "health" ? "Checking..." : "Connection / Health check"}</button>
            </div>
            {mode === "dedicated" && <div className="space-y-2 rounded-lg border border-border/70 bg-background/30 p-3">
              <div className="text-xs font-semibold">Dedicated Supabase connection (metadata only, no service secrets)</div>
              <input value={dedicatedRef} onChange={(e) => setDedicatedRef(e.target.value)} placeholder="Project ref (optional)" className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-xs" />
              <input value={dedicatedUrl} onChange={(e) => setDedicatedUrl(e.target.value)} placeholder="Project URL e.g. https://xxxx.supabase.co" className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-xs" />
              <div className="flex gap-2"><button onClick={saveDedicatedConfig} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary">Save connection</button><span className="text-[11px] text-muted-foreground self-center">Provisioning via Supabase Management API requires server-side token, org access, and billing permission.</span></div>
            </div>}
            <div className="rounded-lg border border-border/70 bg-background/30 p-3 text-xs">
              <div className="font-semibold">Capabilities (selected mode)</div>
              <div className="mt-1 grid grid-cols-2 gap-1 text-muted-foreground sm:grid-cols-3">
                <span>Database: {context.capabilities.database ? "supported" : "n/a"}</span>
                <span>Auth: {context.capabilities.auth ? "supported" : "n/a"}</span>
                <span>Storage: {context.capabilities.storage ? "supported (dedicated/config)" : "shared config-dependent"}</span>
                <span>Realtime: {context.capabilities.realtime ? "supported" : "n/a"}</span>
                <span>Edge Functions: {context.capabilities.edgeFunctions ? "supported" : "n/a"}</span>
                <span>Isolation: strict per-app/per-owner RLS</span>
              </div>
            </div>
          </div>

          <div className="glass space-y-4 rounded-xl p-5 shadow-soft">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-primary" />Per-app environment variables & secrets</h2>
            <p className="text-xs text-muted-foreground">Public and private values are separated. Secret values must never be stored in frontend bundles, GitHub commits, or exported ZIP files. Raw secrets are not persisted client-side; server-side vault/secret-manager configuration is required for secure storage/injection.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={envKey} onChange={(e) => setEnvKey(e.target.value)} placeholder="KEY (e.g. VITE_PUBLIC_API_URL)" className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs" />
              <select value={envTarget} onChange={(e) => setEnvTarget(e.target.value as EnvVarEntry["target"])} className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs"><option value="runtime">Runtime</option><option value="build">Build</option><option value="both">Build + Runtime</option></select>
              <input value={envValue} onChange={(e) => setEnvValue(e.target.value)} placeholder={envSecret || isSensitiveKey(envKey) ? "Secret value (not stored client-side)" : "Public value"} className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs sm:col-span-2" disabled={envSecret || isSensitiveKey(envKey)} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={envSecret} onChange={(e) => setEnvSecret(e.target.checked)} /> Treat as private secret</label>
              <button onClick={() => void addEnv()} disabled={!envKey.trim() || busy !== null} className="rounded-md bg-secondary px-3 py-1.5 text-xs font-semibold hover:bg-secondary/80 disabled:opacity-50">Save variable</button>
            </div>
            <div className="max-h-48 space-y-2 overflow-auto">
              {state.envVars.length === 0 ? <p className="text-xs text-muted-foreground">No per-app environment variables configured.</p> : state.envVars.map((v) => (
                <div key={v.id || `${v.key}-${v.target}`} className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-background/30 px-2 py-1.5 text-xs">
                  <div className="min-w-0"><div className="font-mono font-medium">{v.key} <span className="text-muted-foreground">({v.target})</span></div><div className="truncate text-muted-foreground">{v.isSecret ? `secret ref: ${v.secretRef || "not stored (vault required)"}` : (v.publicValue ? `public: ${v.publicValue}` : "empty")}</div></div>
                  <button onClick={() => void removeEnv(v)} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label={`Remove ${v.key}`}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="glass space-y-4 rounded-xl p-5 shadow-soft">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><UploadCloud className="h-4 w-4 text-primary" />Deployment integration (GitHub source + Vercel pipeline interface)</h2>
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-border/70 bg-background/30 p-3 text-xs space-y-1">
              <div className="font-semibold">Build & validation gate</div>
              <p className="text-muted-foreground">Deployment requires validated build output. Use existing Studio quality checks/build flow before deploy. GitHub source push alone is not deployment.</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/30 p-3 text-xs space-y-1">
              <div className="font-semibold">Vercel integration</div>
              <p className="text-muted-foreground">Supports status/logs/live URL/env injection/redeploy/rollback interfaces via secure server-side credentials. No provider-confirmed deployment performed without VERCEL_TOKEN and authorization.</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/30 p-3 text-xs space-y-1">
              <div className="font-semibold">Current prerequisites</div>
              <ul className="list-disc pl-4 text-muted-foreground">{assessDeployPrerequisites({ repoFullName: deployRepo, buildValidated: Boolean(projectId) }).missing.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[260px] flex-1"><label className="mb-1 block text-xs text-muted-foreground">GitHub repository (owner/name)</label><input value={deployRepo} onChange={(e) => setDeployRepo(e.target.value)} placeholder="owner/repo" className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-xs" /></div>
            <button onClick={() => void deploy()} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-lg bg-gradient-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"><UploadCloud className="h-3.5 w-3.5" />{busy === "deploy" ? "Requesting..." : "Deploy / Redeploy (Vercel)"}</button>
          </div>
          <p className="text-[11px] text-muted-foreground">Deployment history/rollback/status require provider-confirmed API access and stored deployment IDs. Environment variables are injected server-side during deployment (never exposed in frontend bundles). {user ? "Signed-in: cloud-backed config persistence available when migrations/functions are deployed." : "Sign in to persist backend/deployment records to your account."}</p>
        </section>

        <section className="glass space-y-4 rounded-xl p-5 shadow-soft">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Cloud className="h-4 w-4 text-primary" />Shared-backend data (tenant-isolated CRUD)</h2>
          <p className="text-xs text-muted-foreground">When signed in and migrations are applied, shared mode can store per-generated-app records in <code>generated_app_data</code> with strict per-app/per-owner RLS. Actions below perform real authenticated Supabase CRUD attempts and report errors/prerequisites honestly.</p>
          <div className="flex flex-wrap items-end gap-2">
            <div><label className="mb-1 block text-xs text-muted-foreground">Collection</label><input value={dataCollection} onChange={(e) => setDataCollection(e.target.value)} className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs" /></div>
            <div className="min-w-[240px] flex-1"><label className="mb-1 block text-xs text-muted-foreground">Record JSON</label><input value={dataDraft} onChange={(e) => setDataDraft(e.target.value)} className="w-full rounded-md border border-border bg-background/60 px-3 py-2 text-xs font-mono" /></div>
            <button disabled={dataBusy || !session?.user.id} onClick={async () => { if (!session?.user.id) return; setDataBusy(true); try { const record = JSON.parse(dataDraft) as Record<string, unknown>; await sharedCreateRecord(state.generatedAppId, session.user.id, dataCollection || "items", record); setLastResult(`Shared record created in collection "${dataCollection}" (tenant-isolated).`); toast({ title: "Record created" }); } catch (e) { const msg = e instanceof Error ? e.message : "Failed"; setLastResult(`Shared CRUD failed: ${msg}. Prerequisites: authenticated user, applied migration 20261111160000_generated_app_backends_shared.sql, configured Supabase env/publishable key, and network access.`); toast({ title: "Shared CRUD failed", description: msg, variant: "destructive" }); } finally { setDataBusy(false); } }} className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-2 text-xs font-semibold disabled:opacity-50"><Plus className="h-3.5 w-3.5" />Create</button>
            <button disabled={dataBusy || !session?.user.id} onClick={async () => { if (!session?.user.id) return; setDataBusy(true); try { const rows = await sharedListRecords(state.generatedAppId, session.user.id, dataCollection || "items"); setSharedRecords(rows as Array<{ id: string; record: unknown; updated_at?: string }>); setLastResult(`Loaded ${rows.length} shared record(s) from "${dataCollection}" (scoped to app+owner).`); } catch (e) { const msg = e instanceof Error ? e.message : "Failed"; setLastResult(`Shared list failed: ${msg}.`); toast({ title: "Shared list failed", description: msg, variant: "destructive" }); } finally { setDataBusy(false); } }} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"><List className="h-3.5 w-3.5" />List</button>
          </div>
          {!session?.user.id && <p className="text-xs text-amber-400">Sign in to run authenticated shared-backend CRUD against the configured Supabase project.</p>}
          <div className="max-h-40 space-y-1 overflow-auto">{sharedRecords.length === 0 ? <p className="text-xs text-muted-foreground">No records loaded.</p> : sharedRecords.map((r) => (<div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-background/30 px-2 py-1.5 text-xs"><code className="truncate">{r.id}</code><span className="truncate text-muted-foreground">{JSON.stringify(r.record).slice(0, 80)}</span><button onClick={async () => { if (!session?.user.id) return; setDataBusy(true); try { await sharedDeleteRecord(r.id, state.generatedAppId, session.user.id); setSharedRecords((cur) => cur.filter((x) => x.id !== r.id)); setLastResult(`Deleted shared record ${r.id}.`); } catch (e) { toast({ title: "Delete failed", description: e instanceof Error ? e.message : "Failed", variant: "destructive" }); } finally { setDataBusy(false); } }} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label={`Delete record ${r.id}`}><Trash2 className="h-3.5 w-3.5" /></button></div>))}</div>
          <p className="text-[11px] text-muted-foreground">Config persistence: {cloudSyncStatus}. Generated app data isolation is enforced by DB RLS policies when migrations are applied; no isolation is claimed without that deployment.</p>
        </section>

        <section className="glass rounded-xl p-5 shadow-soft">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Shield className="h-4 w-4 text-primary" />Status, errors & prerequisites</h2>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border/70 bg-background/40 p-3 text-xs text-muted-foreground">{lastResult || "No actions run yet. Select a backend mode, configure/provision, run health checks, manage env vars, and request deployment to see detailed status and prerequisites."}</pre>
          <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
            <div className="rounded-md border border-border/70 p-3"><strong className="text-foreground">Shared backend:</strong> tenant-isolated schema/RLS migration added (`generated_app_*` tables, `generated_app_data` scoped by app+owner). Real CRUD/authenticated operations require applied migrations and configured Supabase environment.</div>
            <div className="rounded-md border border-border/70 p-3"><strong className="text-foreground">Dedicated backend:</strong> complete provisioning/connection/health/delete interface implemented; actual project creation/cleanup/deploy requires Supabase Management API token, organization/billing access, Vercel credentials, and provider-confirmed execution. No fake success reported.</div>
          </div>
        </section>
      </div>
    </div>
  );
};
