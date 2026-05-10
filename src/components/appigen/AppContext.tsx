import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User as SupaUser } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
  signOut: () => Promise<void>;

  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<AppNotification, "id" | "read" | "createdAt">) => void;
  markAllRead: () => void;
  clearNotifications: () => void;

  githubConnected: boolean;
  githubUser: string | null;
  connectGithub: (username: string) => void;
  disconnectGithub: () => void;

  accent: string;
  setAccent: (k: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const LS = {
  notif: "appigen.notifications",
  gh: "appigen.github",
  accent: "appigen.accent",
};

const toAppUser = (u: SupaUser | undefined | null): User | null => {
  if (!u) return null;
  const meta = (u.user_metadata || {}) as Record<string, any>;
  const email = u.email ?? "";
  const name =
    meta.full_name ||
    meta.name ||
    (email ? email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "User");
  return { name, email, avatarUrl: meta.avatar_url ?? null };
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

  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try { const v = localStorage.getItem(LS.notif); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [githubUser, setGithubUser] = useState<string | null>(() => {
    try { return localStorage.getItem(LS.gh); } catch { return null; }
  });
  const [accent, setAccentState] = useState<string>(() => {
    try { return localStorage.getItem(LS.accent) || "purple"; } catch { return "purple"; }
  });

  // Apply accent on mount + change
  useEffect(() => {
    const t = ACCENT_THEMES.find((a) => a.key === accent) ?? ACCENT_THEMES[0];
    applyAccent(t.hue);
    try { localStorage.setItem(LS.accent, accent); } catch {}
  }, [accent]);

  // Auth listener BEFORE getSession
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(toAppUser(newSession?.user));
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(toAppUser(data.session?.user));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { localStorage.setItem(LS.notif, JSON.stringify(notifications)); }, [notifications]);
  useEffect(() => { githubUser ? localStorage.setItem(LS.gh, githubUser) : localStorage.removeItem(LS.gh); }, [githubUser]);

  const addNotification = useCallback<AppContextValue["addNotification"]>((n) => {
    setNotifications((prev) => [
      { ...n, id: crypto.randomUUID(), read: false, createdAt: Date.now() },
      ...prev,
    ].slice(0, 30));
  }, []);

  const value: AppContextValue = {
    user,
    session,
    signOut: async () => { await supabase.auth.signOut(); },
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
    addNotification,
    markAllRead: () => setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))),
    clearNotifications: () => setNotifications([]),
    githubConnected: !!githubUser,
    githubUser,
    connectGithub: (u) => { setGithubUser(u); addNotification({ kind: "github", title: "GitHub Connected", description: `Linked account @${u}` }); },
    disconnectGithub: () => setGithubUser(null),
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
