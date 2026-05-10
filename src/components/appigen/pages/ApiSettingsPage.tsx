import { useState } from "react";
import { KeyRound, Save, Wand2 } from "lucide-react";

const MODELS = [
  "Gemini 2.5 Pro",
  "Gemini 2.5 Flash",
  "Gemini 2.5 Flash Lite",
  "GPT-5",
  "GPT-5 Mini",
];

const SAFETY = [
  { key: "harassment", label: "Harassment" },
  { key: "hate", label: "Hate Speech" },
  { key: "explicit", label: "Sexually Explicit" },
  { key: "dangerous", label: "Dangerous Content" },
];

const LEVELS = ["Block none", "Block few", "Block some", "Block most"];

export const ApiSettingsPage = () => {
  const [model, setModel] = useState(MODELS[1]);
  const [system, setSystem] = useState(
    "You are an expert product designer and full-stack engineer. Generate clean, accessible, production-ready React + Tailwind code."
  );
  const [temp, setTemp] = useState(0.7);
  const [topK, setTopK] = useState(40);
  const [topP, setTopP] = useState(0.95);
  const [safety, setSafety] = useState<Record<string, number>>({
    harassment: 2,
    hate: 2,
    explicit: 3,
    dangerous: 2,
  });

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-8">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">API Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Fine-tune model behavior, safety, and generation parameters.
            </p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition-smooth hover:brightness-110">
            <Save className="h-4 w-4" /> Save Changes
          </button>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="glass space-y-5 rounded-xl p-5 shadow-soft lg:col-span-2">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Model Selection
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {MODELS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Wand2 className="h-3.5 w-3.5 text-primary" /> System Instructions
              </label>
              <textarea
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                rows={6}
                className="w-full resize-none rounded-lg border border-border bg-background/60 px-3 py-2.5 text-sm leading-relaxed text-foreground focus:border-primary focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <Slider label="Temperature" value={temp} min={0} max={2} step={0.05} onChange={setTemp} />
              <Slider label="Top-K" value={topK} min={1} max={100} step={1} onChange={setTopK} />
              <Slider label="Top-P" value={topP} min={0} max={1} step={0.01} onChange={setTopP} />
            </div>
          </div>

          <div className="glass space-y-4 rounded-xl p-5 shadow-soft">
            <div>
              <h2 className="text-sm font-semibold">Safety Settings</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Control content filtering thresholds.
              </p>
            </div>
            <div className="space-y-4">
              {SAFETY.map((s) => (
                <div key={s.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{s.label}</span>
                    <span className="font-mono text-primary">{LEVELS[safety[s.key]]}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={1}
                    value={safety[s.key]}
                    onChange={(e) =>
                      setSafety({ ...safety, [s.key]: Number(e.target.value) })
                    }
                    className="mt-1.5 w-full accent-[hsl(var(--primary))]"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-xl p-5 shadow-soft lg:col-span-3">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Environment & Keys</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Keys are managed securely via Lovable Cloud — no client-side configuration required.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { k: "AI_GATEWAY", v: "••••••••••••  managed" },
                { k: "PROJECT_REGION", v: "us-east-1" },
              ].map((e) => (
                <div
                  key={e.k}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 font-mono text-xs"
                >
                  <span className="text-muted-foreground">{e.k}</span>
                  <span className="text-foreground">{e.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function Slider({
  label, value, min, max, step, onChange,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-mono text-primary">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-[hsl(var(--primary))]"
      />
    </div>
  );
}
