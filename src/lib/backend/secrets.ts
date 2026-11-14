import type { EnvVarEntry } from "./types";

const SENSITIVE_PATTERN = /(key|token|secret|password|private|service.?role|dsn|connection)/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_PATTERN.test(key);
}

export function redactSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 6) return "••••••";
  return `${value.slice(0, 2)}••••••${value.slice(-2)}`;
}

export function assertNoPrivateSecretsInSource(source: string): string[] {
  const findings: string[] = [];
  const patterns: Array<[RegExp, string]> = [
    [/SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'`][^"'`\n]{8,}/, "service role key literal"],
    [/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, "JWT-like secret/token literal"],
    [/sk_(live|test)?_[A-Za-z0-9]{16,}/, "private API key literal"],
    [/ghp_[A-Za-z0-9]{20,}/, "GitHub token literal"],
    [/vercel_[A-Za-z0-9_-]{16,}/, "Vercel token literal"],
  ];
  for (const [re, label] of patterns) if (re.test(source)) findings.push(label);
  return findings;
}

export function sanitizeEnvForExport(vars: EnvVarEntry[]): { publicVars: EnvVarEntry[]; blockedSecrets: string[] } {
  const publicVars = vars.filter((v) => !v.isSecret && !isSensitiveKey(v.key));
  const blockedSecrets = vars.filter((v) => v.isSecret || isSensitiveKey(v.key)).map((v) => v.key);
  return { publicVars, blockedSecrets };
}
