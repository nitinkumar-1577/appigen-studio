import { useEffect, useState } from "react";
import { Eye, EyeOff, Github as GithubIcon, KeyRound, Loader2, Lock, Mail, Sparkles, UserRound, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { authErrorMessage, classifyAuthError } from "@/lib/auth/authErrors";
import { getAuthRedirectUrl } from "@/lib/auth/authRedirect";

interface AuthModalProps {
  open: boolean;
  recoveryPending?: boolean;
  onRecoveryHandled?: () => void;
  onClose: () => void;
}

type Screen = "signin" | "signup" | "forgot" | "reset";
type AuthMode = "password" | "otp";

export const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export const AuthModal = ({ open, recoveryPending = false, onRecoveryHandled, onClose }: AuthModalProps) => {
  const [screen, setScreen] = useState<Screen>("signin");
  const [mode, setMode] = useState<AuthMode>("password");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [otpStep, setOtpStep] = useState<"email" | "code">("email");
  const [otp, setOtp] = useState("");
  useEffect(() => {
    if (open && recoveryPending) {
      setScreen("reset");
      setNotice("Choose a new password for your account.");
      onRecoveryHandled?.();
    }
    if (!open) {
      setScreen("signin");
      setMode("password");
      setEmail("");
      setFullName("");
      setPassword("");
      setConfirmation("");
      setNotice("");
      setBusy(false);
      setOtpStep("email");
      setOtp("");
    }
  }, [open, recoveryPending, onRecoveryHandled]);

  if (!open) return null;

  const showError = (title: string, error: unknown, fallback: string) => {
    toast({ title, description: authErrorMessage(error, fallback), variant: "destructive" });
  };

  const validatePassword = () => {
    if (password.length < 8) {
      toast({ title: "Password is too short", description: "Use at least 8 characters.", variant: "destructive" });
      return false;
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      toast({ title: "Use a stronger password", description: "Include at least one letter and one number.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleSignIn = async () => {
    if (!validEmail(email)) {
      toast({ title: "Enter a valid email address", variant: "destructive" });
      return;
    }
    if (!password) {
      toast({ title: "Enter your password", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      const kind = classifyAuthError(error);
      showError(kind === "email_not_confirmed" ? "Email confirmation required" : "Sign-in failed", error, "Could not sign in.");
      return;
    }
    toast({ title: "Signed in", description: "Welcome back to AppiGen." });
    onClose();
  };

  const handleSignUp = async () => {
    if (!fullName.trim()) {
      toast({ title: "Enter your full name", variant: "destructive" });
      return;
    }
    if (!validEmail(email)) {
      toast({ title: "Enter a valid email address", variant: "destructive" });
      return;
    }
    if (!validatePassword()) return;
    if (password !== confirmation) {
      toast({ title: "Passwords do not match", description: "Check both password fields.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: getAuthRedirectUrl(),
      },
    });
    setBusy(false);
    if (error) {
      showError("Sign-up failed", error, "Could not create your account.");
      return;
    }
    if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
      showError("Account already exists", new Error("User already registered"), "");
      setScreen("signin");
      return;
    }
    if (!data.session || !data.user.email_confirmed_at) {
      setNotice("Account created. Check your email and confirm your address before signing in.");
    } else {
      toast({ title: "Account created", description: "Welcome to AppiGen." });
      onClose();
    }
  };

  const sendResetEmail = async () => {
    if (!validEmail(email)) {
      toast({ title: "Enter a valid email address", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: getAuthRedirectUrl() });
    setBusy(false);
    if (error) {
      showError("Could not send reset email", error, "Please try again.");
      return;
    }
    setNotice("If an account exists for this email, a password reset link has been sent.");
  };

  const sendOtp = async () => {
    if (!validEmail(email)) {
      toast({ title: "Enter a valid email address", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) {
      showError("Could not send code", error, "Please try again.");
      return;
    }
    setOtpStep("code");
    setNotice(`A verification code was sent to ${email.trim()}.`);
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otp)) {
      toast({ title: "Enter the 6-digit code", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: otp, type: "email" });
    setBusy(false);
    if (error) {
      showError("Code verification failed", error, "The code may be expired.");
      return;
    }
    toast({ title: "Signed in", description: "Welcome to AppiGen." });
    onClose();
  };

  const updatePassword = async () => {
    if (!validatePassword()) return;
    if (password !== confirmation) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      showError("Could not update password", error, "The reset link may have expired.");
      return;
    }
    toast({ title: "Password updated", description: "You can now sign in with your new password." });
    setScreen("signin");
    setPassword("");
    setConfirmation("");
    setNotice("");
  };

  const signInWithSocialProvider = async (provider: "github" | "google") => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: getAuthRedirectUrl(),
        ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
      },
    });
    if (error) {
      setBusy(false);
      showError(`${provider === "github" ? "GitHub" : "Google"} sign-in unavailable`, error, "Enable this provider in Supabase Auth.");
    }
  };

  const passwordInput = (value: string, setter: (value: string) => void, confirmationField = false) => (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type={(confirmationField ? showConfirmation : showPassword) ? "text" : "password"}
        value={value}
        onChange={(event) => setter(event.target.value)}
        placeholder={confirmationField ? "Confirm password" : "Password"}
        className="w-full rounded-xl border border-border bg-background/60 py-2.5 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <button
        type="button"
        aria-label={((confirmationField ? showConfirmation : showPassword) ? "Hide" : "Show") + " password"}
        onClick={() => confirmationField ? setShowConfirmation((value) => !value) : setShowPassword((value) => !value)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
      >
        {(confirmationField ? showConfirmation : showPassword) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );

  const title = screen === "signup" ? "Create your AppiGen account" : screen === "forgot" ? "Reset your password" : screen === "reset" ? "Set a new password" : "Sign in to AppiGen";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()} className="glass-strong relative w-[440px] max-w-[92vw] rounded-2xl p-7 shadow-elevated">
        <button onClick={onClose} aria-label="Close authentication dialog" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
        <div className="mb-5 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow"><Sparkles className="h-5 w-5 text-primary-foreground" /></div>
          <div><div className="font-display text-lg font-bold">{title}</div><div className="text-xs text-muted-foreground">Secure authentication powered by Supabase</div></div>
        </div>

        {notice && <div role="status" className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-xs text-foreground">{notice}</div>}

        {screen === "forgot" ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Enter your email and we’ll send a secure password reset link.</p>
            <div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="w-full rounded-xl border border-border bg-background/60 py-2.5 pl-10 pr-3 text-sm text-foreground focus:border-primary focus:outline-none" /></div>
            <button onClick={() => void sendResetEmail()} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-70">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Send reset link</button>
            <button onClick={() => setScreen("signin")} className="w-full text-xs font-semibold text-muted-foreground hover:text-foreground">Back to sign in</button>
          </div>
        ) : screen === "reset" ? (
          <div className="space-y-3">
            {passwordInput(password, setPassword)}
            {passwordInput(confirmation, setConfirmation, true)}
            <p className="text-[11px] text-muted-foreground">Use at least 8 characters, including a letter and a number.</p>
            <button onClick={() => void updatePassword()} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-70">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Update password</button>
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-border bg-secondary/40 p-1 text-xs">
              <button onClick={() => { setMode("password"); setOtpStep("email"); }} className={cn("rounded-lg px-3 py-1.5 font-semibold", mode === "password" ? "bg-background text-foreground shadow-soft" : "text-muted-foreground")}>Email & Password</button>
              <button onClick={() => { setMode("otp"); setScreen("signin"); }} className={cn("rounded-lg px-3 py-1.5 font-semibold", mode === "otp" ? "bg-background text-foreground shadow-soft" : "text-muted-foreground")}>Email Code</button>
            </div>
            {mode === "password" && <div className="mb-4 flex items-center gap-2 text-xs">
              <button onClick={() => { setScreen("signin"); setNotice(""); }} className={cn("font-semibold", screen === "signin" ? "text-primary" : "text-muted-foreground")}>Sign in</button>
              <span className="text-muted-foreground/40">·</span>
              <button onClick={() => { setScreen("signup"); setNotice(""); }} className={cn("font-semibold", screen === "signup" ? "text-primary" : "text-muted-foreground")}>Create account</button>
            </div>}
            {mode === "otp" ? (
              <div className="space-y-3">
                {otpStep === "email" ? (
                  <>
                    <div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="w-full rounded-xl border border-border bg-background/60 py-2.5 pl-10 pr-3 text-sm text-foreground focus:border-primary focus:outline-none" /></div>
                    <button onClick={() => void sendOtp()} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-70">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Send verification code</button>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">Enter the 6-digit code sent to {email.trim()}.</p>
                    <input autoFocus inputMode="numeric" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} className="w-full rounded-xl border border-border bg-background/60 px-3 py-3 text-center font-mono text-lg tracking-[0.5em] text-foreground focus:border-primary focus:outline-none" />
                    <button onClick={() => void verifyOtp()} disabled={busy || otp.length !== 6} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-70">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Verify and continue</button>
                    <button onClick={() => setOtpStep("email")} className="w-full text-xs text-muted-foreground hover:text-foreground">Use a different email</button>
                  </>
                )}
              </div>
            ) : <div className="space-y-3">
              {screen === "signup" && <div className="relative"><UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Full name" className="w-full rounded-xl border border-border bg-background/60 py-2.5 pl-10 pr-3 text-sm text-foreground focus:border-primary focus:outline-none" /></div>}
              <div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus={screen === "signin"} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="w-full rounded-xl border border-border bg-background/60 py-2.5 pl-10 pr-3 text-sm text-foreground focus:border-primary focus:outline-none" /></div>
              {passwordInput(password, setPassword)}
              {screen === "signup" && passwordInput(confirmation, setConfirmation, true)}
              <button onClick={() => void (screen === "signup" ? handleSignUp() : handleSignIn())} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-70">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{screen === "signup" ? "Create account" : "Sign in"}</button>
              {screen === "signin" && <button onClick={() => { setScreen("forgot"); setNotice(""); }} className="flex w-full items-center justify-center gap-1 text-xs font-semibold text-primary hover:underline"><KeyRound className="h-3.5 w-3.5" />Forgot password?</button>}
            </div>}
            <div className="mt-5 border-t border-border/60 pt-4">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => void signInWithSocialProvider("google")} disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"><span aria-hidden="true" className="font-bold text-base">G</span>Continue with Google</button>
                <button onClick={() => void signInWithSocialProvider("github")} disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"><GithubIcon className="h-4 w-4" />Continue with GitHub</button>
              </div>
              <p className="mt-2 text-center text-[10px] text-muted-foreground">GitHub login does not connect a repository. Repository access is requested separately.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
