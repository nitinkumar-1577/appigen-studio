import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User as SupaUser } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { applyAppPreferences, readAppPreferences } from "@/lib/appPreferences";

export type User = { name: string; email: string; avatarUrl?: string | null };

export type AppNotification = {
  id: string;
  title: string;
  description: string;
  read: boolean;
  createdAt: number;
  kind: "build" | "credits" | "github" | "system";
};

export type AccentTheme = {
  key: string;
  label: string;
  hue: number; // base hue for primary
};

export const ACCENT_THEMES: AccentTheme[] = [
  { key: "purple", label: "Purple", hue: 258 },
  { key: "blue", label: "Blue", hue: 217 },
  { key: "emerald", label: "Emerald", hue: 152 },
  { key: "rose", label: "Rose", hue: 340 },
];

interface AppContextValue {
  user: User | null;
  session: Session | null;
  authReady: boolean;
  recoveryPending: boolean;
  clearRecoveryPending: () => void;
  signOut: () => Promise<void>;

  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<AppNotification, "id" | "read" | "createdAt">) => void;
  markAllRead: () => void;
  clearNotifications: () => void;

  accent: string;
  setAccent: (k: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const LS = {
  notif: "appigen.notifications",
  accent: "appigen.accent",
};

const toAppUser = (u: SupaUser | undefined | null): User | null => {
  if (!u) return null;
  const meta = u.user_metadata || {};
  const email = u.email ?? "";
  const name =
    (typeof meta.full_name === "string" ? meta.full_name : "") ||
    (typeof meta.name === "string" ? meta.name : "") ||
    (email ? email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "User");
  return { name, email, avatarUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : null };
};

const applyAccent = (hue: number) => {
  const root = document.documentElement;
  root.style.setProperty("--primary", `${hue} 90% 66%`);
  root.style.setProperty("--primary-glow", `${(hue + 12) % 360} 95% 75%`);
  root.style.setProperty("--accent", `${hue} 90% 66%`);
  root.style.setProperty("--ring", `${hue} 90% 66%`);
  root.style.setProperty("--sidebar-primary", `${hue} 90% 66%`);
  root.style.setProperty("--sidebar-ring", `${hue} 90% 66%`);
  root.style.setProperty(
    "--gradient-primary",
    `linear-gradient(135deg, hsl(${hue} 90% 66%), hsl(${(hue + 22) % 360} 88% 70%))`
  );
  root.style.setProperty("--shadow-glow", `0 0 40px hsl(${hue} 90% 66% / 0.35)`);
  root.style.setProperty(
    "--gradient-glow",
    `radial-gradient(60% 60% at 50% 0%, hsl(${hue} 90% 66% / 0.18), transparent 70%)`
  );
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [recoveryPending, setRecoveryPending] = useState(false);

  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try { const v = localStorage.getItem(LS.notif); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [accent, setAccentState] = useState<string>(() => {
    try { return localStorage.getItem(LS.accent) || "purple"; } catch { return "purple"; }
  });

  useEffect(() => {
    applyAppPreferences(readAppPreferences());
  }, []);

  // Apply accent on mount + change
  useEffect(() => {
    const t = ACCENT_THEMES.find((a) => a.key === accent) ?? ACCENT_THEMES[0];
    applyAccent(t.hue);
    try { localStorage.setItem(LS.accent, accent); } catch (error) { console.warn("Could not save accent preference:", error); }
  }, [accent]);

  // Auth listener BEFORE getSession
  useEffect(() => {
    let authEventReceived = false;
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      authEventReceived = true;
      setSession(newSession);
      setUser(toAppUser(newSession?.user));
      setAuthReady(true);
      if (event === "PASSWORD_RECOVERY") setRecoveryPending(true);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted || authEventReceived) return;
      if (error) console.error("Could not restore the Supabase session:", error.message);
      setSession(data.session);
      setUser(toAppUser(data.session?.user));
      setAuthReady(true);
    }).catch((error: unknown) => {
      if (!mounted || authEventReceived) return;
      console.error("Could not restore the Supabase session:", error);
      setAuthReady(true);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => { localStorage.setItem(LS.notif, JSON.stringify(notifications)); }, [notifications]);
  const addNotification = useCallback<AppContextValue["addNotification"]>((n) => {
    setNotifications((prev) => [
      { ...n, id: crypto.randomUUID(), read: false, createdAt: Date.now() },
      ...prev,
    ].slice(0, 30));
  }, []);

  const value: AppContextValue = {
    user,
    session,
    authReady,
    recoveryPending,
    clearRecoveryPending: () => setRecoveryPending(false),
    signOut: async () => { await supabase.auth.signOut(); },
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
    addNotification,
    markAllRead: () => setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))),
    clearNotifications: () => setNotifications([]),
    accent,
    setAccent: setAccentState,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
};
