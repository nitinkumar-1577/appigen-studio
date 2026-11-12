import { useState } from "react";
import {
  LayoutDashboard,
  AppWindow,
  LayoutTemplate,
  KeyRound,
  Sparkles,
  ChevronLeft,
  Settings,
  Palette,
  LoaderCircle,
  Server,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT_THEMES, useApp } from "./AppContext";
import { ProfileMenu } from "./ProfileMenu";

export type ViewKey =
  | "studio"
  | "dashboard"
  | "apps"
  | "templates"
  | "api"
  | "backend"
  | "pricing";

const navItems: { key: ViewKey; icon: LucideIcon; label: string }[] = [
  { key: "studio", icon: Sparkles, label: "Studio" },
  { key: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { key: "apps", icon: AppWindow, label: "My Apps" },
  { key: "templates", icon: LayoutTemplate, label: "Templates" },
  { key: "api", icon: KeyRound, label: "API Settings" },
  { key: "backend", icon: Server, label: "Backend & Deploy" },
];

interface SidebarProps {
  active: ViewKey;
  onChange: (v: ViewKey) => void;
  onOpenSettings: () => void;
  onOpenSignIn: () => void;
  onOpenPricing: () => void;
  isBuilding: boolean;
  progressStage: string;
  /** When true, sidebar is rendered as an overlay drawer (hidden by default) on all screen sizes. */
  overlay?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const Sidebar = ({ active, onChange, onOpenSettings, onOpenSignIn, onOpenPricing, isBuilding, progressStage, overlay = false, open, onOpenChange }: SidebarProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const { accent, setAccent } = useApp();

  const handleNav = (v: ViewKey) => {
    onChange(v);
    if (overlay) onOpenChange(false);
  };

  const showRailToggle = !overlay;

  return (
    <>
      {overlay && open && (
        <div
          onClick={() => onOpenChange(false)}
          className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm animate-fade-in"
          aria-hidden="true"
        />
      )}
      <aside
        aria-label="Workspace navigation"
        className={cn(
          "flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-out",
          overlay
            ? cn(
                "fixed inset-y-0 left-0 z-50 w-64 shadow-elevated",
                open ? "translate-x-0" : "-translate-x-full pointer-events-none",
              )
            : cn(
                "relative z-30 shrink-0",
                collapsed ? "w-[72px]" : "w-60",
              ),
        )}
      >
        <div className="flex h-16 items-center gap-2.5 px-4">
          <button
            onClick={() => handleNav("studio")}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-primary shadow-glow"
            aria-label="Open Studio"
          >
            <Sparkles className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
          </button>
          {(!collapsed || overlay) && (
            <span className="font-display text-lg font-bold tracking-tight text-foreground animate-fade-in">
              AppiGen
            </span>
          )}
          {overlay && (
            <button
              onClick={() => onOpenChange(false)}
              aria-label="Close sidebar"
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-smooth hover:bg-sidebar-accent/60 hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        <nav className="flex-1 px-3 py-4">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = active === item.key;
              return (
                <li key={item.key}>
                  <button
                    onClick={() => handleNav(item.key)}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-smooth",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-[18px] w-[18px] shrink-0",
                        isActive && "text-primary"
                      )}
                    />
                    {(!collapsed || overlay) && <span className="truncate">{item.label}</span>}
                    {isActive && (!collapsed || overlay) && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-glow" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {isBuilding && (
            <div
              role="status"
              aria-live="polite"
              aria-label={`Build progress: ${progressStage}`}
              title={`Build progress: ${progressStage}`}
              className={cn(
                "mt-4 rounded-xl border border-primary/20 bg-primary/[0.07] text-sidebar-foreground shadow-soft",
                collapsed && !overlay ? "flex justify-center p-2.5" : "p-3"
              )}
            >
              <div className={cn("flex items-center gap-2", collapsed && !overlay && "justify-center")}>
                <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-primary" />
                {(!collapsed || overlay) && <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Building your app</span>}
              </div>
              {(!collapsed || overlay) && <p className="mt-2 truncate text-xs font-semibold text-foreground">{progressStage}</p>}
            </div>
          )}
        </nav>

        {(!collapsed || overlay) && (
          <div className="px-4 pb-3">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Palette className="h-3 w-3" /> Accent
            </div>
            <div className="flex items-center gap-2">
              {ACCENT_THEMES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setAccent(t.key)}
                  title={t.label}
                  aria-label={`Use ${t.label} accent`}
                  className={cn(
                    "h-6 w-6 rounded-full border-2 transition-smooth",
                    accent === t.key ? "border-foreground shadow-glow scale-110" : "border-transparent hover:scale-110"
                  )}
                  style={{ background: `hsl(${t.hue} 90% 66%)` }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5 border-t border-sidebar-border p-3">
          <div className={cn("flex items-center gap-2", collapsed && !overlay && "justify-center")}>
            <ProfileMenu onOpenSignIn={onOpenSignIn} onOpenSettings={onOpenSettings} onOpenPricing={onOpenPricing} compact={collapsed && !overlay} />
          </div>
          <button onClick={onOpenSettings} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-smooth hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground">
            <Settings className="h-[18px] w-[18px]" />
            {(!collapsed || overlay) && <span>Settings</span>}
          </button>
        </div>

        {showRailToggle && (
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label="Toggle sidebar"
            className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-elevated text-muted-foreground shadow-soft transition-smooth hover:text-primary"
          >
            <ChevronLeft
              className={cn("h-3.5 w-3.5 transition-transform", collapsed && "rotate-180")}
            />
          </button>
        )}
      </aside>
    </>
  );
};
