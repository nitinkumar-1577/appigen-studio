import { useCallback, useEffect, useState, type ReactNode } from "react";
import { X, Moon, Sun, Monitor, Sliders } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  applyAppPreferences,
  AI_PROVIDERS,
  modelsForProvider,
  readAppPreferences,
  readGenerationSettings,
  saveAppPreferences,
  saveGenerationSettings,
  type AppPreferences,
} from "@/lib/appPreferences";

interface SettingsPanelProps { open: boolean; onClose: () => void; }

export const SettingsPanel = ({ open, onClose }: SettingsPanelProps) => {
  const [preferences, setPreferences] = useState<AppPreferences>(() => readAppPreferences());

  useEffect(() => {
    if (open) setPreferences(readAppPreferences());
  }, [open]);

  useEffect(() => {
    applyAppPreferences(preferences);
  }, [preferences]);

  const update = (next: Partial<AppPreferences>) => setPreferences((current) => ({ ...current, ...next }));
  const cancel = useCallback(() => {
    const saved = readAppPreferences();
    setPreferences(saved);
    applyAppPreferences(saved);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, cancel]);

  const save = () => {
    try {
      saveAppPreferences(preferences);
      const generation = readGenerationSettings();
      saveGenerationSettings({ ...generation, provider: preferences.provider, model: preferences.model });
      applyAppPreferences(preferences);
      onClose();
    } catch (error) {
      toast({ title: "Settings could not be saved", description: error instanceof Error ? error.message : "Browser storage is unavailable.", variant: "destructive" });
    }
  };

  return (
    <>
      <div onClick={cancel} className={cn("fixed inset-0 z-[75] bg-background/70 backdrop-blur-sm transition-opacity", open ? "opacity-100" : "pointer-events-none opacity-0")} />
      <aside className={cn("fixed right-0 top-0 z-[80] flex h-full w-[420px] max-w-[95vw] flex-col border-l border-border bg-surface shadow-elevated transition-transform duration-300", open ? "translate-x-0" : "translate-x-full")}>
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-5">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-semibold">General Settings</h2>
          </div>
          <button onClick={cancel} aria-label="Close settings" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 space-y-6 overflow-auto p-5">
          <Section title="Appearance" hint="System and default follow AppiGen's dark theme">
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: "dark" as const, icon: Moon, label: "Dark" },
                { v: "light" as const, icon: Sun, label: "Light" },
                { v: "system" as const, icon: Monitor, label: "System" },
              ]).map((o) => (
                <button key={o.v} onClick={() => update({ theme: o.v })} className={cn("flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-smooth", preferences.theme === o.v ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground")}>
                  <o.icon className="h-4 w-4" /> {o.label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Default Model" hint="The model selected for new builds">
            <select value={preferences.provider} onChange={(e) => { const provider = e.target.value as AppPreferences["provider"]; update({ provider, model: modelsForProvider(provider)[0] }); }} className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
              {AI_PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider === "nvidia" ? "NVIDIA NIM" : provider.charAt(0).toUpperCase() + provider.slice(1)}</option>)}
            </select>
            <select value={modelsForProvider(preferences.provider).includes(preferences.model) ? preferences.model : modelsForProvider(preferences.provider)[0]} onChange={(e) => update({ model: e.target.value as AppPreferences["model"] })} className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
              {modelsForProvider(preferences.provider).map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
          </Section>

          <Section title="UI Density" hint="Adjust card spacing across the workspace">
            <div className="grid grid-cols-3 gap-2">
              {(["Comfortable", "Compact", "Spacious"] as const).map((density) => (
                <button key={density} onClick={() => update({ density })} className={cn("rounded-xl border px-3 py-2 text-xs font-medium transition-smooth", preferences.density === density ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground")}>{density}</button>
              ))}
            </div>
          </Section>

          <Section title="Workspace">
            <Toggle label="Autodraft" desc="Save prompts locally while you type" value={preferences.autoDraft} onChange={(autoDraft) => update({ autoDraft })} />
            <Toggle label="Anonymous telemetry" desc="Share anonymous usage data to improve AppiGen" value={preferences.telemetry} onChange={(telemetry) => update({ telemetry })} />
          </Section>

          <p className="text-[11px] text-muted-foreground">Model behavior and content safety are configured in <span className="font-semibold text-foreground">API Settings</span>.</p>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 p-4">
          <button onClick={cancel} className="rounded-lg border border-border bg-secondary/40 px-3.5 py-2 text-xs font-medium text-foreground hover:bg-secondary">Cancel</button>
          <button onClick={save} className="rounded-lg bg-gradient-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-glow hover:brightness-110">Save changes</button>
        </footer>
      </aside>
    </>
  );
};

const Section = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <section className="space-y-3">
    <div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
    <div className="space-y-2">{children}</div>
  </section>
);

const Toggle = ({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-3">
    <div className="min-w-0">
      <div className="text-xs font-medium text-foreground">{label}</div>
      <div className="text-[11px] text-muted-foreground">{desc}</div>
    </div>
    <button type="button" role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)} className={cn("relative h-5 w-9 shrink-0 rounded-full transition-smooth", value ? "bg-primary" : "bg-secondary")}>
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-primary-foreground transition-transform", value ? "translate-x-4" : "translate-x-0.5")} />
    </button>
  </div>
);
