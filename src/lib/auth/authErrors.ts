export type AuthErrorKind =
  | "invalid_credentials"
  | "email_exists"
  | "email_not_confirmed"
  | "provider_disabled"
  | "provider_configuration"
  | "network"
  | "redirect"
  | "invalid_recovery_link"
  | "rate_limited"
  | "generic";

export const classifyAuthError = (error: unknown): AuthErrorKind => {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code).toLowerCase()
    : "";
  const errorCode = typeof error === "object" && error !== null && "error_code" in error
    ? String(error.error_code).toLowerCase()
    : "";
  const name = typeof error === "object" && error !== null && "name" in error
    ? String(error.name).toLowerCase()
    : "";

  if (code === "invalid_credentials" || errorCode === "invalid_credentials" || message.includes("invalid login credentials")) return "invalid_credentials";
  if (message.includes("already registered") || message.includes("already been registered") || message.includes("user already exists")) return "email_exists";
  if (message.includes("email not confirmed") || message.includes("confirm your email")) return "email_not_confirmed";
  if (message.includes("unsupported provider") || message.includes("provider is not enabled")) return "provider_disabled";
  if (/redirect|callback url/.test(`${message} ${errorCode}`)) return "redirect";
  if (/invalid_client|client_id|client secret|oauth.*config|provider.*config/.test(`${message} ${errorCode}`)) return "provider_configuration";
  if (/network|fetch failed|failed to fetch|load failed|connection/.test(`${message} ${name}`)) return "network";
  if (message.includes("expired") || message.includes("invalid") && message.includes("link")) return "invalid_recovery_link";
  if (code === "over_request_rate_limit" || errorCode === "over_request_rate_limit" || message.includes("rate limit") || message.includes("too many")) return "rate_limited";
  return "generic";
};

export const authErrorMessage = (error: unknown, fallback: string, provider?: "google" | "github") => {
  const providerName = provider === "github" ? "GitHub" : provider === "google" ? "Google" : "";
  switch (classifyAuthError(error)) {
    case "invalid_credentials": return "The email or password is incorrect.";
    case "email_exists": return "An account already exists for this email. Sign in or reset your password.";
    case "email_not_confirmed": return "Confirm your email address before signing in.";
    case "provider_disabled": return `${providerName || "This"} sign-in is disabled for this Supabase project. Enable ${providerName || "the provider"} in Supabase Dashboard → Authentication → Sign In / Providers, configure its client credentials, and add the Supabase callback URL to the provider's OAuth console.`;
    case "provider_configuration": return `${providerName || "OAuth provider"} sign-in has an invalid provider configuration. Check its client ID and secret in Supabase Dashboard → Authentication → Sign In / Providers, then verify the provider callback URL.`;
    case "network": return `Could not reach Supabase while starting ${providerName || "OAuth"} sign-in. Check your connection and try again.`;
    case "redirect": return `${providerName || "OAuth"} sign-in could not start because the redirect URL is invalid or not allowed. Add this app URL to Supabase Auth → URL Configuration and verify the provider callback URL.`;
    case "invalid_recovery_link": return "This password reset link is invalid or has expired.";
    case "rate_limited": return "Too many attempts. Please wait a moment and try again.";
    default: return error instanceof Error && error.message ? error.message : fallback;
  }
};

