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
  | "pricing";

const navItems: { key: ViewKey; icon: any; label: string }[] = [
  { key: "studio", icon: Sparkles, label: "Studio" },
  { key: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { key: "apps", icon: AppWindow, label: "My Apps" },
  { key: "templates", icon: LayoutTemplate, label: "Templates" },
  { key: "api", icon: KeyRound, label: "API Settings" },
];

interface SidebarProps {
  active: ViewKey;
  onChange: (v: ViewKey) => void;
  onOpenSettings: () => void;
  onOpenSignIn: () => void;
  onOpenPricing: () => void;
}

export const Sidebar = ({ active, onChange, onOpenSettings, onOpenSignIn, onOpenPricing }: SidebarProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const { accent, setAccent } = useApp();

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-smooth",
        collapsed ? "w-[72px]" : "w-60"
      )}
    >
      <div className="flex h-16 items-center gap-2.5 px-4">
        <button
          onClick={() => onChange("studio")}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-primary shadow-glow"
        >
          <Sparkles className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
        </button>
        {!collapsed && (
          <span className="font-display text-lg font-bold tracking-tight text-foreground animate-fade-in">
            AppiGen
          </span>
        )}
      </div>

      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = active === item.key;
            return (
              <li key={item.key}>
                <button
                  onClick={() => onChange(item.key)}
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
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {isActive && !collapsed && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-glow" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Theme accent picker */}
      {!collapsed && (
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

      {/* Profile (above settings) + Settings */}
      <div className="space-y-1.5 border-t border-sidebar-border p-3">
        <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
          <ProfileMenu onOpenSignIn={onOpenSignIn} onOpenSettings={onOpenSettings} onOpenPricing={onOpenPricing} compact={collapsed} />
        </div>
        <button onClick={onOpenSettings} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-smooth hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground">
          <Settings className="h-[18px] w-[18px]" />
          {!collapsed && <span>Settings</span>}
        </button>
      </div>

      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-label="Toggle sidebar"
        className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-elevated text-muted-foreground shadow-soft transition-smooth hover:text-primary"
      >
        <ChevronLeft
          className={cn("h-3.5 w-3.5 transition-transform", collapsed && "rotate-180")}
        />
      </button>
    </aside>
  );
};
