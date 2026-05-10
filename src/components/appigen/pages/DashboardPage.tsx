import { Activity, Sparkles, Zap, Clock, ArrowUpRight, Plus, LayoutTemplate, AppWindow } from "lucide-react";

const stats = [
  { label: "Apps Created", value: "12", delta: "+3 this week", icon: AppWindow },
  { label: "Credits Used", value: "1,240", delta: "of 5,000", icon: Zap },
  { label: "Active Models", value: "4", delta: "Gemini · GPT", icon: Sparkles },
  { label: "Avg. Build Time", value: "8.4s", delta: "−12% vs last", icon: Clock },
];

const recent = [
  { name: "Task Manager Pro", time: "2h ago", model: "Gemini 2.5 Flash" },
  { name: "Portfolio Site", time: "Yesterday", model: "GPT-5 Mini" },
  { name: "Crypto Tracker", time: "2 days ago", model: "Gemini 2.5 Pro" },
  { name: "Recipe AI Bot", time: "5 days ago", model: "Gemini 2.5 Flash" },
];

export const DashboardPage = ({ onNavigate }: { onNavigate: (v: any) => void }) => {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-8">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Here's what's happening in your AppiGen workspace.
            </p>
          </div>
          <button
            onClick={() => onNavigate("studio")}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition-smooth hover:brightness-110"
          >
            <Plus className="h-4 w-4" /> New App
          </button>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="glass rounded-xl p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </span>
                <s.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-2 text-2xl font-bold">{s.value}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{s.delta}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="glass rounded-xl p-5 shadow-soft lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent Activity</h2>
              <button
                onClick={() => onNavigate("apps")}
                className="text-xs text-primary hover:underline"
              >
                View all
              </button>
            </div>
            <ul className="space-y-2">
              {recent.map((r) => (
                <li
                  key={r.name}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2.5 transition-smooth hover:border-primary/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <Activity className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.model}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {r.time}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass rounded-xl p-5 shadow-soft">
            <h2 className="mb-4 text-sm font-semibold">Quick Start</h2>
            <div className="space-y-2">
              {[
                { label: "Open Studio", icon: Sparkles, view: "studio" },
                { label: "Browse Templates", icon: LayoutTemplate, view: "templates" },
                { label: "Manage Apps", icon: AppWindow, view: "apps" },
              ].map((q) => (
                <button
                  key={q.label}
                  onClick={() => onNavigate(q.view)}
                  className="flex w-full items-center justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2.5 text-sm font-medium transition-smooth hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="flex items-center gap-2.5">
                    <q.icon className="h-4 w-4 text-primary" />
                    {q.label}
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
