import { useEffect, useState } from "react";
import { X, Moon, Sun, Monitor, Sliders } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsPanelProps { open: boolean; onClose: () => void; }

const MODELS = ["google/gemini-2.5-flash", "google/gemini-2.5-pro", "openai/gpt-5", "openai/gpt-5-mini"];
const DENSITIES = ["Comfortable", "Compact", "Spacious"] as const;
type Density = typeof DENSITIES[number];
type Theme = "dark" | "light" | "system";

export const SettingsPanel = ({ open, onClose }: SettingsPanelProps) => {
  const [theme, setTheme] = useState<Theme>("dark");
  const [model, setModel] = useState(MODELS[0]);
  const [density, setDensity] = useState<Density>("Comfortable");
  const [autosave, setAutosave] = useState(true);
  const [telemetry, setTelemetry] = useState(false);

  useEffect(() => {
    if (open) {
      const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [open, onClose]);

  return (
    <>
      <div onClick={onClose} className={cn("fixed inset-0 z-[75] bg-background/70 backdrop-blur-sm transition-opacity", open ? "opacity-100" : "pointer-events-none opacity-0")} />
      <aside className={cn("fixed right-0 top-0 z-[80] flex h-full w-[420px] max-w-[95vw] flex-col border-l border-border bg-surface shadow-elevated transition-transform duration-300", open ? "translate-x-0" : "translate-x-full")}>
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-5">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-primary" />
            <h2 className="font-display text-sm font-semibold">General Settings</h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 space-y-6 overflow-auto p-5">
          <Section title="Appearance" hint="Choose how AppiGen looks on your device">
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: "dark" as const, icon: Moon, label: "Dark" },
                { v: "light" as const, icon: Sun, label: "Light" },
                { v: "system" as const, icon: Monitor, label: "System" },
              ]).map((o) => (
                <button key={o.v} onClick={() => setTheme(o.v)} className={cn("flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-smooth", theme === o.v ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground")}>
                  <o.icon className="h-4 w-4" /> {o.label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Default Model" hint="The model used for new builds">
            <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full rounded-xl border border-border bg-background/60 px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20">
              {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Section>

          <Section title="UI Density" hint="How tightly information is packed">
            <div className="grid grid-cols-3 gap-2">
              {DENSITIES.map((d) => (
                <button key={d} onClick={() => setDensity(d)} className={cn("rounded-xl border px-3 py-2 text-xs font-medium transition-smooth", density === d ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground")}>{d}</button>
              ))}
            </div>
          </Section>

          <Section title="Workspace">
            <Toggle label="Autosave drafts" desc="Persist your prompts locally as you type" value={autosave} onChange={setAutosave} />
            <Toggle label="Anonymous telemetry" desc="Help improve AppiGen with usage data" value={telemetry} onChange={setTelemetry} />
          </Section>

          <p className="text-[11px] text-muted-foreground">Looking for temperature, top-K, or safety controls? See <span className="font-semibold text-foreground">API Settings</span>.</p>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 p-4">
          <button onClick={onClose} className="rounded-lg border border-border bg-secondary/40 px-3.5 py-2 text-xs font-medium text-foreground hover:bg-secondary">Cancel</button>
          <button onClick={onClose} className="rounded-lg bg-gradient-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-glow hover:brightness-110">Save changes</button>
        </footer>
      </aside>
    </>
  );
};

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
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
    <button onClick={() => onChange(!value)} className={cn("relative h-5 w-9 shrink-0 rounded-full transition-smooth", value ? "bg-primary" : "bg-secondary")}>
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform", value ? "translate-x-4" : "translate-x-0.5")} />
    </button>
  </div>
);
