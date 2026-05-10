import { useEffect, useRef, useState } from "react";
import { Bell, Check, Sparkles, CreditCard, Github as GithubIcon, Trash2 } from "lucide-react";
import { useApp, type AppNotification } from "./AppContext";
import { cn } from "@/lib/utils";

const iconFor = (k: AppNotification["kind"]) => {
  switch (k) {
    case "build": return Sparkles;
    case "credits": return CreditCard;
    case "github": return GithubIcon;
    default: return Bell;
  }
};

const timeAgo = (t: number) => {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const NotificationsMenu = () => {
  const { notifications, unreadCount, markAllRead, clearNotifications } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-[60] w-[360px] overflow-hidden rounded-xl border border-border bg-[hsl(222_32%_8%)] shadow-elevated animate-fade-in">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
            <div className="text-sm font-semibold">Notifications</div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1 text-[11px] text-primary hover:underline"><Check className="h-3 w-3" /> Mark all read</button>
              )}
              {notifications.length > 0 && (
                <button onClick={clearNotifications} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-destructive" title="Clear all"><Trash2 className="h-3 w-3" /></button>
              )}
            </div>
          </div>
          <div className="max-h-[380px] overflow-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center">
                <Bell className="h-6 w-6 text-muted-foreground" />
                <div className="text-xs text-muted-foreground">You're all caught up.</div>
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = iconFor(n.kind);
                return (
                  <div key={n.id} className={cn("flex items-start gap-3 border-b border-border/40 px-4 py-3 transition-smooth hover:bg-secondary/40", !n.read && "bg-primary/15")}>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-foreground">{n.title}</div>
                      <div className="text-[11px] text-muted-foreground">{n.description}</div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground/70">{timeAgo(n.createdAt)}</div>
                    </div>
                    {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
