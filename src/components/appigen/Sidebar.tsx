import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  AppWindow,
  LayoutTemplate,
  KeyRound,
  Sparkles,
  X,
  Settings,
  Palette,
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
];

interface SidebarProps {
  active: ViewKey;
  onChange: (v: ViewKey) => void;
  onOpenSettings: () => void;
  onOpenSignIn: () => void;
  onOpenPricing: () => void;
  /** Desktop: user-controlled pinned/expanded state (in-flow). */
  pinned: boolean;
  /** Desktop: fully hide the in-flow sidebar (Lovable-style workspace mode). */
  hidden: boolean;
  /** Desktop: show the sidebar as an overlay opened from the header tab. */
  overlayOpen: boolean;
  onOverlayOpenChange: (open: boolean) => void;
  /** Desktop: allow hiding the in-flow sidebar (only inside an app workspace). */
  /** Mobile: responsive drawer state. */
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export const Sidebar = ({ active, onChange, onOpenSettings, onOpenSignIn, onOpenPricing, pinned, hidden, overlayOpen, onOverlayOpenChange, mobileOpen, onMobileOpenChange }: SidebarProps) => {
  const { accent, setAccent } = useApp();

  useEffect(() => {
    if (!overlayOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOverlayOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlayOpen, onOverlayOpenChange]);

  const handleNav = (v: ViewKey, close?: () => void) => {
    onChange(v);
    close?.();
  };

  const SidebarBody = ({ mobile, overlay = false, onClose }: { mobile: boolean; overlay?: boolean; onClose?: () => void }) => {
    const expanded = mobile || overlay ? true : pinned;
    const compact = !expanded;
    const closeSidebar = () => (onClose ? onClose() : onMobileOpenChange(false));
    const closeOnNav = mobile || overlay ? closeSidebar : undefined;
    return (
      <>
        <div className="flex h-16 items-center gap-2.5 px-4">
          <button
            onClick={() => handleNav("studio", closeOnNav)}
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-primary shadow-glow"
            aria-label="Open Studio"
          >
            <Sparkles className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
          </button>
          {expanded && (
            <span className="font-display text-lg font-bold tracking-tight text-foreground">
              AppiGen
            </span>
          )}
          {mobile ? (
            <button
              onClick={closeSidebar}
              aria-label="Close sidebar"
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-smooth hover:bg-sidebar-accent/60 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <nav className="flex-1 px-3 py-2">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = active === item.key;
              return (
                <li key={item.key}>
                  <button
                    onClick={() => handleNav(item.key, closeOnNav)}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-smooth",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                    )}
                    title={compact ? item.label : undefined}
                  >
                    <item.icon
                      className={cn(
                        "h-[18px] w-[18px] shrink-0",
                        isActive && "text-primary"
                      )}
                    />
                    {expanded && <span className="truncate">{item.label}</span>}
                    {isActive && expanded && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-glow" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

        </nav>

        {expanded && (
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
          <div className={cn("flex items-center gap-2", compact && "justify-center")}>
            <ProfileMenu onOpenSignIn={onOpenSignIn} onOpenSettings={onOpenSettings} onOpenPricing={onOpenPricing} compact={compact} />
          </div>
          <button onClick={onOpenSettings} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-smooth hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground" title={compact ? "Settings" : undefined}>
            <Settings className="h-[18px] w-[18px]" />
            {expanded && <span>Settings</span>}
          </button>
        </div>
      </>
    );
  };

  return (
    <>
      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          onClick={() => onMobileOpenChange(false)}
          className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm md:hidden animate-fade-in"
          aria-hidden="true"
        />
      )}
      <aside
        aria-label="Workspace navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar shadow-elevated transition-transform duration-300 ease-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full pointer-events-none",
        )}
      >
        <SidebarBody mobile />
      </aside>

      {/* Desktop overlay opened from the header tab */}
      {overlayOpen && (
        <>
          <div
            onClick={() => onOverlayOpenChange(false)}
            className="fixed inset-0 z-40 hidden bg-transparent md:block"
            aria-hidden="true"
          />
          <aside
            aria-label="Workspace navigation"
            className="fixed inset-y-0 left-0 z-50 hidden h-full w-64 flex-col border-r border-sidebar-border bg-sidebar shadow-elevated animate-fade-in md:flex"
          >
            <SidebarBody mobile={false} overlay onClose={() => onOverlayOpenChange(false)} />
          </aside>
        </>
      )}

      {/* Desktop sidebar (no hover popup/peek overlay) */}
      {!hidden && (
        <aside
          aria-label="Workspace navigation"
          className={cn(
            "hidden md:flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 ease-out relative z-30 shrink-0",
            pinned ? "w-60" : "w-[72px]",
          )}
        >
          <SidebarBody mobile={false} />
        </aside>
      )}
    </>
  );
};
