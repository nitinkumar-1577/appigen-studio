import { useEffect, useRef, useState } from "react";
import { Mail, Sparkles, X, ArrowRight, Loader2, Lock, Github as GithubIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

type Mode = "otp" | "password";
type PwAction = "signin" | "signup";

const RESEND_SECONDS = 60;

export const AuthModal = ({ open, onClose }: AuthModalProps) => {
  const [mode, setMode] = useState<Mode>("otp");
  const [pwAction, setPwAction] = useState<PwAction>("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [step, setStep] = useState<"email" | "otp">("email");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!open) {
      setMode("otp"); setPwAction("signin");
      setEmail(""); setPassword("");
      setStep("email"); setOtp(["", "", "", "", "", ""]);
      setResendIn(0);
    }
  }, [open]);

  // Resend cooldown ticker
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  if (!open) return null;

  const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  // ---- Email + Password ----
  const handlePassword = async () => {
    if (!validEmail(email)) { toast({ title: "Invalid email", variant: "destructive" }); return; }
    if (password.length < 6) {
      toast({ title: "Password too short", description: "At least 6 characters.", variant: "destructive" }); return;
    }
    setBusy(true);
    if (pwAction === "signup") {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin },
      });
      setBusy(false);
      if (error) { toast({ title: "Sign-up failed", description: error.message, variant: "destructive" }); return; }
      toast({ title: "🎉 Account created", description: "You can now sign in." });
      setPwAction("signin");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) { toast({ title: "Sign-in failed", description: error.message, variant: "destructive" }); return; }
      toast({ title: "✅ Signed in", description: `Welcome back!` });
      onClose();
    }
  };

  // ---- OTP ----
  const sendOtp = async (isResend = false) => {
    if (!validEmail(email)) { toast({ title: "Invalid email", variant: "destructive" }); return; }
    if (resendIn > 0) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) { toast({ title: "Couldn't send code", description: error.message, variant: "destructive" }); return; }
    setStep("otp");
    setResendIn(RESEND_SECONDS);
    toast({ title: isResend ? "📨 Code resent" : "✉️ Code sent", description: `6-digit code emailed to ${email}` });
    setTimeout(() => inputs.current[0]?.focus(), 50);
  };

  const handleOtp = (i: number, v: string) => {
    const digits = v.replace(/\D/g, "");
    if (digits.length > 1) {
      const next = digits.slice(0, 6).split("");
      const padded = [...next, ...Array(6 - next.length).fill("")];
      setOtp(padded);
      const focusIdx = Math.min(next.length, 5);
      inputs.current[focusIdx]?.focus();
      if (next.length === 6) setTimeout(() => verifyOtp(padded.join("")), 50);
      return;
    }
    const next = [...otp]; next[i] = digits; setOtp(next);
    if (digits && i < 5) inputs.current[i + 1]?.focus();
    if (digits && i === 5 && next.every((d) => d !== "")) {
      setTimeout(() => verifyOtp(next.join("")), 50);
    }
  };

  const verifyOtp = async (codeArg?: string) => {
    const code = codeArg ?? otp.join("");
    if (code.length !== 6) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    setBusy(false);
    if (error) {
      toast({ title: "Invalid code", description: "Please try again.", variant: "destructive" });
      setOtp(["", "", "", "", "", ""]);
      setTimeout(() => inputs.current[0]?.focus(), 50);
      return;
    }
    toast({ title: "✅ Signed in", description: `Welcome, ${email}` });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="glass-strong relative w-[440px] max-w-[92vw] rounded-2xl p-7 shadow-elevated">
        <button onClick={onClose} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-4 w-4" /></button>

        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-display text-lg font-bold">Sign in to AppiGen</div>
            <div className="text-xs text-muted-foreground">One-time code or password</div>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-border bg-secondary/40 p-1">
          {(["otp", "password"] as Mode[]).map((m) => (
            <button key={m} onClick={() => { setMode(m); setStep("email"); }}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition-smooth",
                mode === m ? "bg-background text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")}>
              {m === "otp" ? "OTP Code" : "Email & Password"}
            </button>
          ))}
        </div>

        {mode === "password" ? (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-center gap-2 text-xs">
              <button onClick={() => setPwAction("signin")} className={cn("font-semibold", pwAction === "signin" ? "text-primary" : "text-muted-foreground hover:text-foreground")}>Sign in</button>
              <span className="text-muted-foreground/40">·</span>
              <button onClick={() => setPwAction("signup")} className={cn("font-semibold", pwAction === "signup" ? "text-primary" : "text-muted-foreground hover:text-foreground")}>Create account</button>
            </div>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
                className="w-full rounded-xl border border-border bg-background/60 py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePassword()}
                placeholder="Password (min 6 chars)"
                className="w-full rounded-xl border border-border bg-background/60 py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <button onClick={handlePassword} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition-smooth hover:brightness-110 disabled:opacity-70">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {busy ? "Please wait…" : pwAction === "signup" ? "Create account" : "Sign in"}
            </button>
          </div>
        ) : step === "email" ? (
          <div className="space-y-4 animate-fade-in">
            <label className="block text-xs font-medium text-muted-foreground">Email address</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendOtp(false)}
                placeholder="you@company.com"
                className="w-full rounded-xl border border-border bg-background/60 py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <button onClick={() => sendOtp(false)} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition-smooth hover:brightness-110 disabled:opacity-70">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {busy ? "Sending code…" : "Send 6-digit code"}
            </button>
          </div>
        ) : (
          <div className="space-y-4 animate-fade-in">
            <div className="text-sm">
              <span className="text-muted-foreground">Enter the 6-digit code sent to </span>
              <span className="font-medium text-foreground">{email}</span>
            </div>
            <div className="flex justify-between gap-2">
              {otp.map((d, i) => (
                <input key={i} ref={(el) => (inputs.current[i] = el)} value={d}
                  onChange={(e) => handleOtp(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !otp[i] && i > 0) inputs.current[i - 1]?.focus();
                    if (e.key === "Enter") verifyOtp();
                  }}
                  inputMode="numeric" maxLength={6} pattern="[0-9]*"
                  className="h-12 w-11 rounded-xl border border-border bg-background/60 text-center font-mono text-lg font-bold text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
              ))}
            </div>
            <button onClick={() => verifyOtp()} disabled={busy || otp.join("").length !== 6} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition-smooth hover:brightness-110 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {busy ? "Verifying…" : "Verify & Continue"}
            </button>
            <div className="flex items-center justify-between text-xs">
              <button onClick={() => setStep("email")} className="text-muted-foreground hover:text-foreground">← Use a different email</button>
              <button
                onClick={() => sendOtp(true)}
                disabled={resendIn > 0 || busy}
                className={cn("font-semibold transition-smooth",
                  resendIn > 0 ? "cursor-not-allowed text-muted-foreground/60" : "text-primary hover:underline")}
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 border-t border-border/60 pt-4">
          <button disabled title="GitHub OAuth not yet supported in Lovable Cloud"
            className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-xs font-semibold text-muted-foreground opacity-60">
            <GithubIcon className="h-4 w-4" />
            Continue with GitHub <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-[10px]">Coming soon</span>
          </button>
        </div>

        <p className="mt-3 text-center text-[11px] text-muted-foreground">By continuing you agree to AppiGen's Terms & Privacy.</p>
      </div>
    </div>
  );
};
