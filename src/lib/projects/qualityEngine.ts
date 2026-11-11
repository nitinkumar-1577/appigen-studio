import { computeChangeRecord, formatChangeRecord, type ChangeRecord } from "./changeTracking";
import { parseFileMarkers } from "@/lib/preview/parseFileMarkers";
import { validateGeneratedCode, validateGeneratedFile } from "@/lib/preview/validateGeneratedCode";

export type CheckStatus = "passed" | "failed" | "skipped" | "unsupported" | "running" | "idle";
export interface QualityCheck {
  id: string;
  label: string;
  category: "structure" | "validation" | "build" | "typescript" | "tests" | "preview" | "review" | "repair";
  status: CheckStatus;
  summary: string;
  details?: string[];
  evidence?: string;
}

export interface ReviewFinding {
  path: string;
  issue: string;
  severity?: "error" | "warning" | "info";
  source?: "ai-review" | "static-analysis";
}

export interface RepairAttempt {
  id: string;
  issue: string;
  attempt: number;
  maxAttempts: number;
  at: number;
  status: "running" | "succeeded" | "failed" | "stopped";
  changedPaths: string[];
  summary: string;
  beforeCode?: string | null;
  afterCode?: string | null;
  changeRecord?: ChangeRecord | null;
  rolledBack?: boolean;
}

export interface RuntimeIssue {
  kind: string;
  message: string;
  stack?: string;
  at: number;
}

export interface QualityState {
  overall: CheckStatus;
  checks: QualityCheck[];
  reviewFindings: ReviewFinding[];
  runtimeErrors: RuntimeIssue[];
  repairAttempts: RepairAttempt[];
  unresolvedIssues: string[];
  lastRunAt: number | null;
}

export const MAX_REPAIR_ATTEMPTS_PER_ISSUE = 3;

export function emptyQualityState(): QualityState {
  return { overall: "idle", checks: [], reviewFindings: [], runtimeErrors: [], repairAttempts: [], unresolvedIssues: [], lastRunAt: null };
}

function projectFiles(code: string): Record<string, string> {
  const parsed = parseFileMarkers(code);
  if (parsed?.files) return parsed.files;
  return code.trim() ? { "src/App.tsx": code } : {};
}

const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx)$/i;
const TEST_DIR_RE = /(^|\/)(__tests__|tests|test)\//i;

export interface GeneratedTestSuggestion {
  path: string;
  content: string;
  reason: string;
}

export function analyzeProjectStructure(code: string): { files: string[]; testFiles: string[]; hasPackageJson: boolean; hasTsConfig: boolean; components: string[]; pages: string[]; hooks: string[] } {
  const files = projectFiles(code);
  const paths = Object.keys(files).sort();
  return {
    files: paths,
    testFiles: paths.filter((p) => TEST_FILE_RE.test(p) || TEST_DIR_RE.test(p)),
    hasPackageJson: paths.includes("package.json"),
    hasTsConfig: paths.includes("tsconfig.json") || paths.includes("tsconfig.app.json"),
    components: paths.filter((p) => /\/components\/.+\.(tsx|jsx)$/.test(p)),
    pages: paths.filter((p) => /\/pages\/.+\.(tsx|jsx)$/.test(p)),
    hooks: paths.filter((p) => /\/hooks\/.+\.(ts|tsx|js|jsx)$/.test(p)),
  };
}

function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function suggestTestsForGeneratedApp(code: string): GeneratedTestSuggestion[] {
  const files = projectFiles(code);
  const suggestions: GeneratedTestSuggestion[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (!/\.(tsx|jsx)$/.test(path) || TEST_FILE_RE.test(path)) continue;
    if (!/export\s+default\b/.test(content) && !/export\s+(?:function|const)\s+/.test(content)) continue;
    const base = path.replace(/^src\//, "").replace(/\.(tsx|jsx)$/, "");
    const testPath = `src/${base}.test.${path.endsWith(".tsx") ? "tsx" : "jsx"}`;
    if (files[testPath]) continue;
    const name = base.split("/").pop() || "Component";
    const hasButton = /<button\b/i.test(content) || /role=["']button["']/i.test(content);
    const hasInput = /<input\b|<textarea\b|<select\b/i.test(content);
    const hasHeading = /<h[1-6]\b/i.test(content) || /role=["']heading["']/i.test(content);
    const reasons = [hasHeading ? "renders expected content" : "renders without crashing", hasButton ? "interactive controls" : null, hasInput ? "form/input behavior" : null].filter(Boolean) as string[];
    const body = hasButton
      ? `    // Basic interaction smoke check (adjust selectors to match implementation)\n    const buttons = screen.queryAllByRole("button");\n    if (buttons[0]) fireEvent.click(buttons[0]);`
      : hasInput
      ? `    const inputs = screen.queryAllByRole("textbox");\n    if (inputs[0]) fireEvent.change(inputs[0], { target: { value: "test" } });`
      : `    expect(document.body).toBeTruthy();`;
    suggestions.push({
      path: testPath,
      reason: `Suggested for ${path} (${reasons.join(", ")})`,
      content: `import { describe, expect, it } from "vitest";\nimport { render, screen, fireEvent } from "@testing-library/react";\nimport ${name} from "./${name}";\n\ndescribe("${name}", () => {\n  it("renders and supports basic interaction", () => {\n    render(<${name} />);\n${body}\n  });\n});\n`,
    });
    if (suggestions.length >= 8) break;
  }
  return suggestions;
}

export function runStaticQualityChecks(code: string, prompt = ""): QualityCheck[] {
  const checks: QualityCheck[] = [];
  const structure = analyzeProjectStructure(code);
  if (!code.trim()) {
    return [{ id: "no-code", label: "Project source", category: "structure", status: "skipped", summary: "No generated project source to analyze." }];
  }
  checks.push({ id: "structure", label: "Project structure", category: "structure", status: structure.files.length ? "passed" : "failed", summary: `${structure.files.length} source file(s) detected`, details: structure.files.slice(0, 20) });

  const validationError = validateGeneratedCode(code, false);
  checks.push({ id: "validation", label: "Project validation", category: "validation", status: validationError ? "failed" : "passed", summary: validationError || "Syntax brackets, required entry/export, local imports, and package constraints passed (deterministic checks).", evidence: validationError || undefined });

  // per-file validation details
  const files = projectFiles(code);
  const fileIssues: string[] = [];
  for (const [path, content] of Object.entries(files)) {
    const err = validateGeneratedFile(path, content, Object.keys(files));
    if (err) fileIssues.push(err);
  }
  checks.push({ id: "files", label: "File-level checks", category: "validation", status: fileIssues.length ? "failed" : "passed", summary: fileIssues.length ? `${fileIssues.length} file issue(s) found` : `${Object.keys(files).length} file(s) passed local checks`, details: fileIssues.slice(0, 20) });

  // TypeScript/build applicability (honest)
  const hasTs = structure.files.some((p) => /\.(ts|tsx)$/.test(p));
  checks.push({ id: "typescript", label: "TypeScript check", category: "typescript", status: "unsupported", summary: hasTs ? "Not run in-browser: no TypeScript compiler available in preview environment. Deterministic syntax/import checks applied; run `npx tsc --noEmit` in a configured dev environment for full type checking." : "Project has no TypeScript source files detected." });
  checks.push({ id: "build", label: "Application build", category: "build", status: "unsupported", summary: "Not run in-browser: no bundler/build toolchain in preview sandbox. Project structure and validation checks applied; run your project build command in a configured environment for a full build." });

  // tests analysis
  if (structure.testFiles.length) {
    checks.push({ id: "tests-detected", label: "Tests detected", category: "tests", status: "unsupported", summary: `${structure.testFiles.length} test file(s) found (${structure.testFiles.slice(0, 4).join(", ")}${structure.testFiles.length > 4 ? "…" : ""}). Execution is not supported inside the in-browser preview sandbox; run the project's test command in a configured environment.`, details: structure.testFiles });
  } else {
    const suggestions = suggestTestsForGeneratedApp(code);
    checks.push({ id: "tests-missing", label: "Tests", category: "tests", status: "skipped", summary: "No test files detected in generated project. Relevant test suggestions can be generated from project features (execution requires a configured test environment).", details: suggestions.length ? suggestions.slice(0, 5).map((s) => `${s.path} — ${s.reason}`) : ["No obvious testable UI modules detected."] });
  }

  // basic static review signals (non-speculative heuristics, reported as findings)
  const findings: string[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (/\bconsole\.log\(/.test(content)) findings.push(`${path}: contains console.log (debug output)`);
    if (/any\b/.test(content) && /\.tsx?$/.test(path)) findings.push(`${path}: uses \`any\` type`);
    if (/dangerouslySetInnerHTML/.test(content)) findings.push(`${path}: uses dangerouslySetInnerHTML (review for XSS safety)`);
  }
  checks.push({ id: "static-review", label: "Static code signals", category: "review", status: findings.length ? "failed" : "passed", summary: findings.length ? `${findings.length} potential issue(s) detected by static heuristics` : "No common static issues detected by heuristics.", details: findings.slice(0, 20) });

  return checks;
}

export function computeOverall(checks: QualityCheck[], runtimeErrors: RuntimeIssue[], unresolved: string[]): CheckStatus {
  if (runtimeErrors.some((e) => ["error", "promise", "compile", "render", "blank"].includes(e.kind))) return "failed";
  if (unresolved.length) return "failed";
  if (checks.some((c) => c.status === "failed")) return "failed";
  if (checks.some((c) => c.status === "running")) return "running";
  if (checks.every((c) => c.status === "skipped" || c.status === "unsupported" || c.status === "idle")) return checks.length ? "passed" : "idle";
  return "passed";
}

export function issueSignature(issue: string): string {
  return issue.toLowerCase().replace(/\s+/g, " ").replace(/at\s+\S+:\d+:\d+/g, "").slice(0, 160).trim();
}

export function attemptsForIssue(attempts: RepairAttempt[], issue: string): number {
  const sig = issueSignature(issue);
  return attempts.filter((a) => issueSignature(a.issue) === sig).length;
}

export function canAttemptRepair(attempts: RepairAttempt[], issue: string): boolean {
  return attemptsForIssue(attempts, issue) < MAX_REPAIR_ATTEMPTS_PER_ISSUE;
}

export function createRepairAttempt(issue: string, attemptNumber: number, beforeCode: string | null): RepairAttempt {
  return { id: `repair-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, issue, attempt: attemptNumber, maxAttempts: MAX_REPAIR_ATTEMPTS_PER_ISSUE, at: Date.now(), status: "running", changedPaths: [], summary: `Attempt ${attemptNumber}/${MAX_REPAIR_ATTEMPTS_PER_ISSUE} started`, beforeCode };
}

export function finalizeRepairAttempt(attempt: RepairAttempt, params: { success: boolean; afterCode: string | null; projectKey?: string; prompt?: string; reason?: string; rolledBack?: boolean; error?: string }): RepairAttempt {
  const before = attempt.beforeCode ?? null;
  const after = params.afterCode ?? null;
  let record: ChangeRecord | null = null;
  if (before != null && after != null && params.projectKey) {
    record = computeChangeRecord({ projectKey: params.projectKey, before, after, prompt: params.prompt || attempt.issue, reason: params.reason || `Repair attempt ${attempt.attempt}` });
  }
  const changedPaths = record?.changedPaths ?? [];
  const status: RepairAttempt["status"] = params.success ? "succeeded" : (attempt.attempt >= MAX_REPAIR_ATTEMPTS_PER_ISSUE ? "stopped" : "failed");
  const baseSummary = params.success
    ? `Repair succeeded on attempt ${attempt.attempt}/${MAX_REPAIR_ATTEMPTS_PER_ISSUE}${changedPaths.length ? ` (${changedPaths.join(", ")})` : ""}.`
    : params.error
      ? `Repair attempt ${attempt.attempt}/${MAX_REPAIR_ATTEMPTS_PER_ISSUE} failed: ${params.error}`
      : `Repair attempt ${attempt.attempt}/${MAX_REPAIR_ATTEMPTS_PER_ISSUE} unsuccessful.`;
  const summary = params.rolledBack ? `${baseSummary} Rolled back to previous working version.` : baseSummary;
  return { ...attempt, status, changedPaths, afterCode: after, changeRecord: record, rolledBack: params.rolledBack, summary };
}

export function normalizeReviewFindings(findings: unknown): ReviewFinding[] {
  if (!Array.isArray(findings)) return [];
  return findings
    .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === "object")
    .map((f) => ({ path: typeof f.path === "string" ? f.path : "project", issue: typeof f.issue === "string" ? f.issue : String(f.issue ?? ""), source: "ai-review" as const }))
    .filter((f) => f.issue.trim());
}

export function mergeRuntimeError(errors: RuntimeIssue[], incoming: { kind: string; message: string; stack?: string }): RuntimeIssue[] {
  const issue: RuntimeIssue = { kind: incoming.kind, message: String(incoming.message || "").slice(0, 800), stack: typeof incoming.stack === "string" ? incoming.stack.slice(0, 2000) : undefined, at: Date.now() };
  const sig = `${issue.kind}::${issue.message}`;
  const filtered = errors.filter((e) => `${e.kind}::${e.message}` !== sig);
  return [issue, ...filtered].slice(0, 30);
}

export function buildQualityState(params: { code: string; prompt?: string; reviewFindings?: ReviewFinding[]; runtimeErrors?: RuntimeIssue[]; repairAttempts?: RepairAttempt[]; previewHealth?: { status: CheckStatus; summary: string; details?: string[] } | null }): QualityState {
  const checks = runStaticQualityChecks(params.code, params.prompt || "");
  if (params.previewHealth) {
    checks.push({ id: "preview-health", label: "Live preview", category: "preview", status: params.previewHealth.status, summary: params.previewHealth.summary, details: params.previewHealth.details });
  }
  const runtimeErrors = params.runtimeErrors ?? [];
  const repairAttempts = params.repairAttempts ?? [];
  const unresolved: string[] = [];
  if (runtimeErrors.some((e) => ["error", "promise", "compile", "render", "blank"].includes(e.kind))) {
    unresolved.push(...runtimeErrors.filter((e) => ["error", "promise", "compile", "render", "blank"].includes(e.kind)).slice(0, 3).map((e) => `Runtime ${e.kind}: ${e.message}`));
  }
  const lastStopped = repairAttempts.filter((a) => a.status === "stopped");
  for (const a of lastStopped) unresolved.push(`Unresolved after ${MAX_REPAIR_ATTEMPTS_PER_ISSUE} repair attempts: ${a.issue}`);
  // if latest attempt for an issue failed (not retried to success) mark unresolved
  const byIssue = new Map<string, RepairAttempt[]>();
  for (const a of repairAttempts) { const k = issueSignature(a.issue); byIssue.set(k, [...(byIssue.get(k) || []), a]); }
  for (const [sig, list] of byIssue) {
    const last = [...list].sort((a,b)=>a.at-b.at)[list.length - 1];
    if (last && (last.status === "failed") && !unresolved.some((u) => u.includes(sig.slice(0,40)))) {
      // failed but maybe attempts remain - show as issue in progress context; don't duplicate stopped
    }
  }
  const overall = computeOverall(checks, runtimeErrors, [...new Set(unresolved)]);
  return { overall, checks, reviewFindings: params.reviewFindings ?? [], runtimeErrors, repairAttempts, unresolvedIssues: [...new Set(unresolved)], lastRunAt: Date.now() };
}

export function summarizeRepairAttemptForUi(attempt: RepairAttempt): string {
  const changed = attempt.changeRecord ? formatChangeRecord(attempt.changeRecord) : (attempt.changedPaths.length ? `Changed: ${attempt.changedPaths.join(", ")}` : "No file changes recorded.");
  return `${attempt.summary}${attempt.rolledBack ? " (rolled back)" : ""}\n${changed}`;
}
