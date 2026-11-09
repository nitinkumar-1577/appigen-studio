export type AuthErrorKind =
  | "invalid_credentials"
  | "email_exists"
  | "email_not_confirmed"
  | "provider_disabled"
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

  if (code === "invalid_credentials" || errorCode === "invalid_credentials" || message.includes("invalid login credentials")) return "invalid_credentials";
  if (message.includes("already registered") || message.includes("already been registered") || message.includes("user already exists")) return "email_exists";
  if (message.includes("email not confirmed") || message.includes("confirm your email")) return "email_not_confirmed";
  if (message.includes("unsupported provider") || message.includes("provider is not enabled")) return "provider_disabled";
  if (message.includes("expired") || message.includes("invalid") && message.includes("link")) return "invalid_recovery_link";
  if (code === "over_request_rate_limit" || errorCode === "over_request_rate_limit" || message.includes("rate limit") || message.includes("too many")) return "rate_limited";
  return "generic";
};

export const authErrorMessage = (error: unknown, fallback: string) => {
  switch (classifyAuthError(error)) {
    case "invalid_credentials": return "The email or password is incorrect.";
    case "email_exists": return "An account already exists for this email. Sign in or reset your password.";
    case "email_not_confirmed": return "Confirm your email address before signing in.";
    case "provider_disabled": return "Google sign-in is disabled for this Supabase project. Enable Google in Supabase Dashboard → Authentication → Sign In / Providers, add the OAuth client ID and secret, and use the callback URL shown there in Google Cloud Console.";
    case "invalid_recovery_link": return "This password reset link is invalid or has expired.";
    case "rate_limited": return "Too many attempts. Please wait a moment and try again.";
    default: return error instanceof Error && error.message ? error.message : fallback;
  }
};

