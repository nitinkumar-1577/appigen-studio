import { useEffect, useRef, useState } from "react";
import { LogOut, User as UserIcon, Settings as SettingsIcon, CreditCard } from "lucide-react";
import { useApp } from "./AppContext";

interface ProfileMenuProps {
  onOpenSignIn: () => void;
  onOpenSettings: () => void;
  onOpenPricing: () => void;
  compact?: boolean;
}

const initials = (name: string) =>
  name.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "U";

export const ProfileMenu = ({ onOpenSignIn, onOpenSettings, onOpenPricing, compact }: ProfileMenuProps) => {
  const { user, signOut } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!user) {
    return (
      <button onClick={onOpenSignIn} className="flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary/50 px-3 text-xs font-semibold text-foreground transition-smooth hover:border-primary/50 hover:bg-secondary">
        Sign in
      </button>
    );
  }

  return (
    <div className="relative w-full" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-smooth hover:bg-sidebar-accent/60">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-primary text-xs font-bold text-primary-foreground shadow-glow ring-2 ring-background">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
          ) : initials(user.name)}
        </span>
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-foreground">{user.name}</span>
            <span className="block truncate text-[10px] text-muted-foreground">{user.email}</span>
          </span>
        )}
      </button>
      {open && (
        <div className="glass-strong absolute bottom-12 left-0 z-[60] w-64 overflow-hidden rounded-xl shadow-elevated animate-fade-in">
          <div className="flex items-center gap-3 border-b border-border/60 p-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-primary text-sm font-bold text-primary-foreground">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
              ) : initials(user.name)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{user.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">{user.email}</div>
            </div>
          </div>
          <div className="p-1.5">
            <MenuItem icon={UserIcon} label="My Account" onClick={() => setOpen(false)} />
            <MenuItem icon={CreditCard} label="Billing & Plan" onClick={() => { setOpen(false); onOpenPricing(); }} />
            <MenuItem icon={SettingsIcon} label="Settings" onClick={() => { setOpen(false); onOpenSettings(); }} />
          </div>
          <div className="border-t border-border/60 p-1.5">
            <MenuItem icon={LogOut} label="Logout" danger onClick={() => { setOpen(false); signOut(); }} />
          </div>
        </div>
      )}
    </div>
  );
};

const MenuItem = ({ icon: Icon, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) => (
  <button onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-smooth ${danger ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-secondary"}`}>
    <Icon className="h-3.5 w-3.5" />
    {label}
  </button>
);
