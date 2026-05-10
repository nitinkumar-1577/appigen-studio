import { Check, Zap, Sparkles, Building2, Plus } from "lucide-react";

const TIERS = [
  {
    name: "Basic",
    price: "Free",
    period: "forever",
    icon: Sparkles,
    features: [
      "100 credits / month",
      "Public API access",
      "Community templates",
      "Gemini Flash Lite",
    ],
    cta: "Current Plan",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$19",
    period: "/ month",
    icon: Zap,
    features: [
      "5,000 credits / month",
      "All standard models",
      "Priority API access",
      "Custom templates",
      "Email support",
    ],
    cta: "Upgrade to Pro",
    highlight: true,
  },
  {
    name: "Business",
    price: "$49",
    period: "/ month",
    icon: Building2,
    features: [
      "20,000 credits / month",
      "All models incl. GPT-5 & Gemini Pro",
      "Team workspaces",
      "SSO + RBAC",
      "Dedicated support",
    ],
    cta: "Upgrade to Business",
    highlight: false,
  },
];

const used = 1240;
const total = 5000;
const pct = Math.round((used / total) * 100);

export const PricingPage = () => {
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-8">
        <header>
          <h1 className="font-display text-3xl font-bold tracking-tight">Pricing & Credits</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Transparent, usage-based plans powered by Lovable Cloud.
          </p>
        </header>

        {/* Credit Usage Dashboard */}
        <div className="glass grid grid-cols-1 gap-6 rounded-xl p-6 shadow-soft md:grid-cols-[200px_1fr]">
          <div className="flex items-center justify-center">
            <div className="relative h-[140px] w-[140px]">
              <svg viewBox="0 0 120 120" className="-rotate-90">
                <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="10" />
                <circle
                  cx="60"
                  cy="60"
                  r={r}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={c}
                  strokeDashoffset={offset}
                  style={{ filter: "drop-shadow(0 0 8px hsl(var(--primary) / 0.6))" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-2xl font-bold">{100 - pct}%</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Remaining</div>
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-3">
            <div>
              <div className="text-sm font-semibold">Credit Usage</div>
              <div className="text-xs text-muted-foreground">
                Resets on May 1, 2026 · Pro Plan
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{used.toLocaleString()} used</span>
                <span className="font-mono text-foreground">{total.toLocaleString()} total</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-gradient-primary"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-glow transition-smooth hover:brightness-110">
                <Plus className="h-3.5 w-3.5" /> Top-up Credits
              </button>
              <button className="rounded-lg border border-border bg-secondary/40 px-3.5 py-2 text-xs font-semibold text-foreground transition-smooth hover:bg-secondary">
                View Usage Logs
              </button>
            </div>
          </div>
        </div>

        {/* Tiers */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.name}
              className={`relative flex flex-col rounded-xl p-6 shadow-soft transition-smooth ${
                t.highlight
                  ? "glass-strong border-primary/50 shadow-glow"
                  : "glass"
              }`}
            >
              {t.highlight && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-primary px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-glow">
                  Most Popular
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                  <t.icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm font-semibold">{t.name}</span>
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-4xl font-bold">{t.price}</span>
                <span className="text-xs text-muted-foreground">{t.period}</span>
              </div>
              <ul className="mt-5 flex-1 space-y-2.5">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-foreground/90">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className={`mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-smooth ${
                  t.highlight
                    ? "bg-gradient-primary text-primary-foreground shadow-glow hover:brightness-110"
                    : "border border-border bg-secondary/40 text-foreground hover:bg-secondary"
                }`}
              >
                {t.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
