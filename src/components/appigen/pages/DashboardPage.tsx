import { useCallback, useEffect, useState } from "react";
import { Activity, Sparkles, Zap, Clock, ArrowUpRight, Plus, LayoutTemplate, AppWindow, LockKeyhole, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { readActivity, type ActivityEntry } from "@/lib/appPreferences";
import { loadProjectActivity } from "@/lib/projects/projectRepository";
import { toast } from "@/hooks/use-toast";
import type { ViewKey } from "../Sidebar";

interface DashboardPageProps {
  userId: string | null;
  onNavigate: (view: ViewKey) => void;
  onOpenSignIn: () => void;
}

export const DashboardPage = ({ userId, onNavigate, onOpenSignIn }: DashboardPageProps) => {
  const [projectCount, setProjectCount] = useState(0);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));

  const refresh = useCallback(async () => {
    if (!userId) {
      setProjectCount(0);
      setActivity([]);
      setLoading(false);
      return;
    }
    const [{ count, error }, activityResult] = await Promise.all([
      supabase.from("projects").select("id", { count: "exact", head: true }).eq("user_id", userId),
      loadProjectActivity(userId).then((entries) => ({ entries, error: null })).catch((activityError: unknown) => ({ entries: readActivity(userId), error: activityError })),
    ]);
    if (error) toast({ title: "Dashboard data unavailable", description: error.message, variant: "destructive" });
    else setProjectCount(count ?? 0);
    if (activityResult.error) {
      toast({ title: "Activity history unavailable", description: activityResult.error instanceof Error ? activityResult.error.message : "Your activity could not be loaded from the account.", variant: "destructive" });
    }
    setActivity(activityResult.entries);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
    if (!userId) return;
    const onActivity = (event: Event) => {
      if ((event as CustomEvent<string>).detail === userId) setActivity(readActivity(userId));
    };
    window.addEventListener("appigen:activity", onActivity);
    const channel = supabase.channel(`dashboard-projects-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "projects", filter: `user_id=eq.${userId}` }, () => void refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "user_activity", filter: `user_id=eq.${userId}` }, () => void refresh())
      .subscribe();
    return () => {
      window.removeEventListener("appigen:activity", onActivity);
      void supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  if (!userId) {
    return (
      <div className="h-full overflow-auto">
        <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10"><LockKeyhole className="h-6 w-6 text-primary" /></div>
          <h1 className="mt-5 font-display text-2xl font-bold">Your workspace, at a glance</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">Sign in to see your saved app count, build activity, and personal usage insights. Nothing is shown from other accounts.</p>
          <button onClick={onOpenSignIn} className="mt-5 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow hover:brightness-110">Sign in to continue</button>
        </div>
      </div>
    );
  }

  const builds = activity.filter((entry) => entry.kind === "build" || entry.kind === "edit");
  const promptCharacters = builds.reduce((total, entry) => total + (entry.promptCharacters ?? 0), 0);
  const buildTimes = builds.flatMap((entry) => entry.durationMs ? [entry.durationMs] : []);
  const averageSeconds = buildTimes.length ? (buildTimes.reduce((sum, time) => sum + time, 0) / buildTimes.length / 1000).toFixed(1) : null;
  const activeModel = builds.find((entry) => entry.detail)?.detail || "No builds yet";
  const stats = [
    { label: "Apps Created", value: loading ? "…" : projectCount.toLocaleString(), delta: "Saved to your account", icon: AppWindow },
    { label: "Prompt Characters", value: promptCharacters.toLocaleString(), delta: "Submitted in completed builds", icon: Zap },
    { label: "Active Model", value: activeModel.replace(/^groq:/, ""), delta: "Used for your latest successful build", icon: Sparkles },
    { label: "Avg. Build Time", value: averageSeconds ? `${averageSeconds}s` : "—", delta: buildTimes.length ? `${buildTimes.length} completed build${buildTimes.length === 1 ? "" : "s"}` : "Recorded after your first build", icon: Clock },
  ];

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Your Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">Live account data and activity for your AppiGen workspace.</p>
          </div>
          <button onClick={() => onNavigate("studio")} className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition-smooth hover:brightness-110">
            <Plus className="h-4 w-4" /> New App
          </button>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="glass rounded-xl p-4 shadow-soft">
              <div className="flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{stat.label}</span><stat.icon className="h-4 w-4 text-primary" /></div>
              <div className="mt-2 truncate text-2xl font-bold" title={stat.value}>{stat.value}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{stat.delta}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="glass rounded-xl p-5 shadow-soft lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent Activity</h2>
              <span className="text-[11px] text-muted-foreground">This account only</span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading your activity…</div>
            ) : activity.length ? (
              <ul className="space-y-2">
                {activity.slice(0, 8).map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2.5 transition-smooth hover:border-primary/40">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Activity className="h-4 w-4 text-primary" /></div>
                      <div className="min-w-0"><div className="truncate text-sm font-medium">{entry.title}</div><div className="truncate text-xs text-muted-foreground">{entry.detail}</div></div>
                    </div>
                    <time className="shrink-0 text-xs text-muted-foreground" dateTime={new Date(entry.createdAt).toISOString()}>{new Date(entry.createdAt).toLocaleString()}</time>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">Your successful builds and project actions will show up here.</div>
            )}
          </div>

          <div className="glass rounded-xl p-5 shadow-soft">
            <h2 className="mb-4 text-sm font-semibold">Quick Start</h2>
            <div className="space-y-2">
              {[
                { label: "Open Studio", icon: Sparkles, view: "studio" as const },
                { label: "Browse Templates", icon: LayoutTemplate, view: "templates" as const },
                { label: "Manage Apps", icon: AppWindow, view: "apps" as const },
              ].map((item) => (
                <button key={item.label} onClick={() => onNavigate(item.view)} className="flex w-full items-center justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2.5 text-sm font-medium transition-smooth hover:border-primary/40 hover:bg-primary/5">
                  <span className="flex items-center gap-2.5"><item.icon className="h-4 w-4 text-primary" />{item.label}</span><ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))}
            </div>
            <p className="mt-4 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">Remaining credit balance is not available because no account credit quota is configured.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
