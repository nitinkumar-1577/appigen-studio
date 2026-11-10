import { useState } from "react";
import { Save, Wand2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  AI_PROVIDERS,
  modelsForProvider,
  readAppPreferences,
  readGenerationSettings,
  saveAppPreferences,
  saveGenerationSettings,
  type GenerationSettings,
} from "@/lib/appPreferences";

const SAFETY: { key: keyof GenerationSettings["safety"]; label: string }[] = [
  { key: "harassment", label: "Harassment" },
  { key: "hate", label: "Hate Speech" },
  { key: "explicit", label: "Sexually Explicit" },
  { key: "dangerous", label: "Dangerous Content" },
];
const LEVELS = ["Block none", "Block few", "Block some", "Block most"];

export const healthStatusLabel = (status?: string) => {
  switch (status) {
    case "working": return "Working";
    case "missing": return "Not configured";
    case "invalid_key": return "Invalid key";
    case "permission_denied": return "Permission denied";
    case "quota_exhausted": return "Quota exhausted";
    case "rate_limited": return "Rate limited";
    case "model_unavailable": return "Model unavailable";
    case "timeout": return "Timed out";
    case "network_error": return "Network error";
    case "request_error": return "Request error";
    default: return status || "Unknown";
  }
};

export const ApiSettingsPage = () => {
  const [settings, setSettings] = useState<GenerationSettings>(() => readGenerationSettings());
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthResults, setHealthResults] = useState<Array<{
    provider: string;
    label: string;
    configured: boolean;
    authentication?: { status: string; detail?: string };
    generation?: { model: string; status: string; detail?: string };
  }>>([]);
  const update = (values: Partial<GenerationSettings>) => setSettings((current) => ({ ...current, ...values }));
  const save = () => {
    try {
      saveGenerationSettings(settings);
      saveAppPreferences({ ...readAppPreferences(), provider: settings.provider, model: settings.model });
      toast({ title: "API settings saved", description: "New builds will use these model, instruction, and safety settings." });
    } catch (error) {
      toast({ title: "API settings could not be saved", description: error instanceof Error ? error.message : "Browser storage is unavailable.", variant: "destructive" });
    }
  };
  const checkProviders = async () => {
    setHealthLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("Appigen", { body: { mode: "health" } });
      if (error) throw error;
      if (!Array.isArray(data?.results)) throw new Error("The health route returned no provider results.");
      setHealthResults(data.results);
    } catch (error) {
      toast({ title: "Provider health check failed", description: error instanceof Error ? error.message : "Could not check providers.", variant: "destructive" });
    } finally {
      setHealthLoading(false);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-8">
        <header className="flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">API Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">Configure model behavior and generation safety.</p>
          </div>
          <button onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition-smooth hover:brightness-110">
            <Save className="h-4 w-4" /> Save Changes
          </button>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="glass space-y-5 rounded-xl p-5 shadow-soft lg:col-span-2">
            <div>
              <label htmlFor="api-provider" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Provider</label>
              <select id="api-provider" value={settings.provider} onChange={(e) => { const provider = e.target.value as GenerationSettings["provider"]; update({ provider, model: modelsForProvider(provider)[0] }); }} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none">
                {AI_PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider === "nvidia" ? "NVIDIA NIM" : provider.charAt(0).toUpperCase() + provider.slice(1)}</option>)}
              </select>
              <label htmlFor="api-model" className="mb-2 mt-4 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Model</label>
              <select id="api-model" value={modelsForProvider(settings.provider).includes(settings.model) ? settings.model : modelsForProvider(settings.provider)[0]} onChange={(e) => update({ model: e.target.value as GenerationSettings["model"] })} className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none">
                {modelsForProvider(settings.provider).map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
              <p className="mt-1.5 text-[11px] text-muted-foreground">Provider credentials remain server-managed. Health checks never return API keys.</p>
            </div>

            <div>
              <label htmlFor="system-instructions" className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Wand2 className="h-3.5 w-3.5 text-primary" /> System Instructions
              </label>
              <textarea id="system-instructions" value={settings.systemInstructions} onChange={(e) => update({ systemInstructions: e.target.value.slice(0, 4000) })} rows={6} maxLength={4000} className="w-full resize-y rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm leading-relaxed text-foreground focus:border-primary focus:outline-none" />
              <div className="mt-1 text-right text-[10px] text-muted-foreground">{settings.systemInstructions.length}/4000</div>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Slider label="Temperature" value={settings.temperature} min={0} max={2} step={0.05} onChange={(temperature) => update({ temperature })} />
              <Slider label="Top-P" value={settings.topP} min={0} max={1} step={0.01} onChange={(topP) => update({ topP })} />
            </div>
          </div>

          <div className="glass space-y-4 rounded-xl p-5 shadow-soft">
            <div>
              <h2 className="text-sm font-semibold">Safety Settings</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">The backend applies these thresholds and always blocks clearly harmful requests.</p>
            </div>
            <div className="space-y-4">
              {SAFETY.map(({ key, label }) => (
                <div key={key}>
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor={`safety-${key}`} className="font-medium text-foreground">{label}</label>
                    <span className="font-mono text-primary">{LEVELS[settings.safety[key]]}</span>
                  </div>
                  <input id={`safety-${key}`} type="range" min={0} max={3} step={1} value={settings.safety[key]} onChange={(e) => update({ safety: { ...settings.safety, [key]: Number(e.target.value) } })} className="mt-1.5 w-full accent-[hsl(var(--primary))]" />
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-xl p-5 shadow-soft lg:col-span-3">
            <p className="text-xs text-muted-foreground">Provider credentials are managed securely by the server. Changes here are stored in this browser and sent with each new build; secret keys are never shown in the client.</p>
          </div>
          <div className="glass space-y-4 rounded-xl p-5 shadow-soft lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Provider health</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Checks configured status, authentication, and a real generation request without exposing secrets.</p>
              </div>
              <button onClick={() => void checkProviders()} disabled={healthLoading} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-50">
                {healthLoading ? "Checking..." : "Check all providers"}
              </button>
            </div>
            {healthResults.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {healthResults.map((result) => (
                  <div key={result.provider} className="rounded-lg border border-border/70 bg-background/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{result.label}</span>
                      <span className={result.configured ? "text-xs text-emerald-400" : "text-xs text-muted-foreground"}>{result.configured ? "Key configured" : "Not configured"}</span>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <div>Auth: <strong className="text-foreground">{healthStatusLabel(result.authentication?.status)}</strong></div>
                      <div>Generation: <strong className="text-foreground">{healthStatusLabel(result.generation?.status)}</strong></div>
                      <div>Model: <strong className="font-mono text-foreground">{result.generation?.model ?? "—"}</strong></div>
                      {result.generation?.detail && <div className="break-words text-destructive">{result.generation.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-mono text-primary">{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1.5 w-full accent-[hsl(var(--primary))]" />
    </div>
  );
}
