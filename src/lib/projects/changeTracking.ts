import { parseFileMarkers } from "@/lib/preview/parseFileMarkers";

export interface FileChange {
  path: string;
  status: "added" | "modified" | "removed" | "unchanged";
  summary: string;
  diff: string;
}

export interface ChangeRecord {
  id: string;
  projectKey: string;
  prompt: string;
  reason: string;
  at: number;
  baseVersionId?: string | null;
  resultVersionId?: string | null;
  changedPaths: string[];
  addedPaths: string[];
  removedPaths: string[];
  unchangedCount: number;
  files: FileChange[];
  summary: string;
}

function lines(value: string) { return value.replace(/\r\n/g, "\n").split("\n"); }

function simpleDiff(before: string, after: string, max = 40): string {
  const a = lines(before);
  const b = lines(after);
  if (before === after) return "";
  const out: string[] = [];
  // LCS-based compact diff for readability; falls back to bounded unified-like output.
  const n = a.length, m = b.length;
  if (n * m <= 40000) {
    const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(`- ${a[i++]}`); }
      else { out.push(`+ ${b[j++]}`); }
      if (out.length >= max) break;
    }
    while (out.length < max && i < n) out.push(`- ${a[i++]}`);
    while (out.length < max && j < m) out.push(`+ ${b[j++]}`);
  } else {
    const setB = new Set(b);
    for (const l of a) if (!setB.has(l)) { out.push(`- ${l}`); if (out.length >= max) break; }
    const setA = new Set(a);
    for (const l of b) if (!setA.has(l)) { out.push(`+ ${l}`); if (out.length >= max) break; }
  }
  if (out.length >= max) out.push("… (diff truncated)");
  return out.join("\n");
}

function summarizeFile(status: FileChange["status"], before: string, after: string): string {
  if (status === "added") return `added (${lines(after).length} lines)`;
  if (status === "removed") return `removed (${lines(before).length} lines)`;
  if (status === "unchanged") return "unchanged";
  const b = lines(before).length, a = lines(after).length;
  const delta = a - b;
  return `modified (${delta === 0 ? "same size" : delta > 0 ? `+${delta}` : `${delta}`} lines)`;
}

export function computeChangeRecord(params: {
  projectKey: string;
  before: string | null;
  after: string;
  prompt: string;
  reason?: string;
  baseVersionId?: string | null;
  resultVersionId?: string | null;
}): ChangeRecord {
  const beforeParsed = params.before ? parseFileMarkers(params.before) : null;
  const afterParsed = parseFileMarkers(params.after);
  const beforeFiles = beforeParsed?.files ?? (params.before && !beforeParsed ? { "src/App.tsx": params.before } : {});
  const afterFiles = afterParsed?.files ?? (!afterParsed ? { "src/App.tsx": params.after } : {});
  const allPaths = [...new Set([...Object.keys(beforeFiles), ...Object.keys(afterFiles)])].sort();
  const files: FileChange[] = allPaths.map((path) => {
    const before = beforeFiles[path];
    const after = afterFiles[path];
    const status: FileChange["status"] = before == null ? "added" : after == null ? "removed" : before === after ? "unchanged" : "modified";
    return { path, status, summary: summarizeFile(status, before ?? "", after ?? ""), diff: status === "modified" || status === "added" || status === "removed" ? simpleDiff(before ?? "", after ?? "") : "" };
  });
  const modifiedPaths = files.filter((f) => f.status === "modified").map((f) => f.path);
  const addedPaths = files.filter((f) => f.status === "added").map((f) => f.path);
  const removedPaths = files.filter((f) => f.status === "removed").map((f) => f.path);
  const changedPaths = [...modifiedPaths, ...addedPaths, ...removedPaths];
  const unchangedCount = files.filter((f) => f.status === "unchanged").length;
  const summaryParts = [
    modifiedPaths.length ? `modified ${modifiedPaths.length}` : "",
    addedPaths.length ? `added ${addedPaths.length}` : "",
    removedPaths.length ? `removed ${removedPaths.length}` : "",
    unchangedCount ? `${unchangedCount} unchanged` : "",
  ].filter(Boolean);
  const summary = changedPaths.length ? `Changes: ${summaryParts.join(", ")} (${changedPaths.slice(0, 6).join(", ")}${changedPaths.length > 6 ? "…" : ""})` : "No file content changes detected.";
  return {
    id: `change-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    projectKey: params.projectKey,
    prompt: params.prompt,
    reason: params.reason || "Project update",
    at: Date.now(),
    baseVersionId: params.baseVersionId ?? null,
    resultVersionId: params.resultVersionId ?? null,
    changedPaths, addedPaths, removedPaths, unchangedCount,
    files: files.filter((f) => f.status !== "unchanged").slice(0, 30),
    summary,
  };
}

export function formatChangeRecord(record: ChangeRecord): string {
  const linesOut = [`${record.summary}`, `Reason: ${record.reason}`];
  if (record.changedPaths.length) linesOut.push(`Touched: ${record.changedPaths.join(", ")}`);
  if (record.unchangedCount) linesOut.push(`Preserved unchanged: ${record.unchangedCount} file(s)`);
  return linesOut.join("\n");
}

export function formatChangeRecordDetailed(record: ChangeRecord, maxFiles = 6): string {
  const parts = [formatChangeRecord(record)];
  for (const file of record.files.slice(0, maxFiles)) {
    parts.push(`\n[${file.status}] ${file.path} — ${file.summary}`);
    if (file.diff) parts.push(file.diff);
  }
  return parts.join("\n");
}
