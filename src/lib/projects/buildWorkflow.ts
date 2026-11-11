import { formatFileMarkers, parseFileMarkers } from "@/lib/preview/parseFileMarkers";
import { impactedFiles, rankFilesForIntent, understandProject, type ProjectUnderstanding } from "./projectUnderstanding";

export type BuildFileStatus = "queued" | "generating" | "completed" | "validating" | "failed" | "retrying";
export interface BuildFileProgress { path: string; purpose: string; status: BuildFileStatus; error?: string }

const SAFE_PROJECT_PATH = /^(src|public)\/(?!.*(?:^|\/)\.\.?\/)[A-Za-z0-9_./-]+\.(?:tsx?|jsx?|css|html|json|svg)$/;

export function validateBuildFileResponse(value: unknown, expectedPath: string): { path: string; content: string; provider?: string } {
  if (!SAFE_PROJECT_PATH.test(expectedPath) || expectedPath.includes("..")) throw new Error(`Unsafe planned file path: ${expectedPath}`);
  if (!value || typeof value !== "object") throw new Error("The generator returned an invalid file response.");
  const result = value as Record<string, unknown>;
  if (result.path !== expectedPath) throw new Error(`Expected ${expectedPath}, received ${String(result.path ?? "no path")}.`);
  if (typeof result.content !== "string" || !result.content.trim()) throw new Error(`The generator returned an empty file for ${expectedPath}.`);
  return { path: expectedPath, content: result.content.trim(), ...(typeof result.provider === "string" ? { provider: result.provider } : {}) };
}

export function mergeGeneratedFile(source: string, path: string, content: string): string {
  if (!SAFE_PROJECT_PATH.test(path) || path.includes("..")) throw new Error(`Unsafe project file path: ${path}`);
  const parsed = parseFileMarkers(source);
  if (!parsed) {
    if (path === "src/App.tsx" || path === "src/App.jsx") return formatFileMarkers({ [path]: content });
    throw new Error(`Cannot merge ${path} because the existing project source is not a file tree.`);
  }
  return formatFileMarkers({ ...parsed.files, [path]: content });
}

export function validateFileTree(source: string, requiredPaths: string[]): string | null {
  const markerCount = [...source.matchAll(/^\s*\/\/\s*FILE:\s*[^\n]+/gm)].length;
  const parsed = parseFileMarkers(source);
  if (!parsed) return "The generated project has no file tree.";
  if (markerCount !== Object.keys(parsed.files).length) return "The project contains duplicate paths.";
  const paths = Object.keys(parsed.files);
  if (new Set(paths).size !== paths.length) return "The project contains duplicate paths.";
  const unsafe = paths.find((path) => !SAFE_PROJECT_PATH.test(path) || path.includes(".."));
  if (unsafe) return `Unsafe project path: ${unsafe}`;
  const empty = paths.find((path) => !parsed.files[path]?.trim());
  if (empty) return `Project file is empty: ${empty}`;
  const missing = requiredPaths.filter((path) => !Object.hasOwn(parsed.files, path));
  if (missing.length) return `Missing required files: ${missing.join(", ")}`;
  return null;
}

export interface SelectFilesForEditOptions {
  understanding?: ProjectUnderstanding | null;
  recentlyChanged?: string[];
  maxFiles?: number;
}

function uniquePaths(paths: string[], allowed: Set<string>, maxFiles: number): string[] {
  const out: string[] = [];
  for (const path of paths) {
    if (!allowed.has(path) || out.includes(path)) continue;
    out.push(path);
    if (out.length >= maxFiles) break;
  }
  return out;
}

export function selectFilesForEdit(source: string, prompt: string, options: SelectFilesForEditOptions = {}): string[] {
  const parsed = parseFileMarkers(source);
  if (!parsed) return ["src/App.tsx"];
  const paths = Object.keys(parsed.files);
  const allowed = new Set(paths);
  const understanding = options.understanding ?? understandProject(source);
  const maxFiles = Math.max(1, Math.min(options.maxFiles ?? 6, paths.length));
  const text = prompt.toLowerCase();

  if (understanding) {
    const ranked = rankFilesForIntent(understanding, prompt);
    const direct = ranked.slice(0, 4).map((item) => item.path);
    const mentioned = paths.filter((path) => {
      const base = path.split("/").pop()?.toLowerCase() ?? "";
      const stem = base.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      return stem.length > 2 && text.includes(stem);
    });
    const followUpContext = /same|previous|earlier|last|revert|undo|go back|restore|previous change/.test(text) ? (options.recentlyChanged ?? []).filter((p) => allowed.has(p)) : [];
    const styleIntent = /style|css|theme|dark|light|layout|responsive|color|font|button|design/.test(text);
    const seeds = uniquePaths([...followUpContext, ...mentioned, ...direct], allowed, maxFiles);
    const related = seeds.flatMap((seed) => [
      ...(understanding.reverseDependencyGraph[seed] ?? []),
      ...(understanding.dependencyGraph[seed] ?? []),
    ]).filter((p) => !seeds.includes(p));
    const defaults = [understanding.styles[0], ...understanding.entryPoints, "src/App.tsx", "src/App.jsx"].filter((p): p is string => Boolean(p) && allowed.has(p));
    const selected = uniquePaths([
      ...seeds,
      ...related,
      ...(styleIntent ? understanding.styles : []),
      ...(seeds.length ? [] : defaults),
    ], allowed, maxFiles);
    if (selected.length) return selected;
  }

  // Fallback: keyword ranking over path+content (legacy behavior) plus safe defaults.
  const words = (prompt.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? [])
    .filter((word) => !new Set(["the", "and", "for", "with", "please", "make", "add", "update", "change", "modify", "this", "that", "into", "from", "app"]).has(word));
  const ranked = Object.entries(parsed.files).map(([path, content]) => ({
    path,
    score: words.reduce((score, word) => score + (`${path} ${content}`.toLowerCase().includes(word) ? 1 : 0), 0),
  })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
  if (ranked.length) return ranked.slice(0, Math.max(1, Math.min(maxFiles, ranked.length))).map(({ path }) => path);
  const likely = ["src/App.tsx", "src/App.jsx", "src/styles.css"].filter((path) => Object.hasOwn(parsed.files, path));
  return likely.length ? uniquePaths(likely, allowed, maxFiles) : [Object.keys(parsed.files)[0]];
}

export async function runSequentialFileBuild<T>(options: {
  files: Array<{ path: string; purpose: string }>;
  initialSource: string;
  completedPaths?: string[];
  retries?: number;
  signal: AbortSignal;
  generate: (file: { path: string; purpose: string }) => Promise<T>;
  validate: (file: { path: string; purpose: string }, result: T, source: string) => void;
  merge: (source: string, file: { path: string; purpose: string }, result: T) => string;
  onProgress?: (file: BuildFileProgress, source: string, completedPaths: string[]) => void;
}) {
  let source = options.initialSource;
  const completed = new Set(options.completedPaths ?? []);
  const retries = Math.max(0, options.retries ?? 0);
  for (const file of options.files) {
    if (completed.has(file.path)) continue;
    let attempt = 0;
    while (true) {
      if (options.signal.aborted) throw new DOMException("Build stopped", "AbortError");
      options.onProgress?.({ ...file, status: attempt > 0 ? "retrying" : "generating", error: undefined }, source, [...completed]);
      try {
        const result = await options.generate(file);
        options.onProgress?.({ ...file, status: "validating" }, source, [...completed]);
        options.validate(file, result, source);
        source = options.merge(source, file, result);
        completed.add(file.path);
        options.onProgress?.({ ...file, status: "completed" }, source, [...completed]);
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.signal.aborted || error instanceof DOMException && error.name === "AbortError") throw error;
        if (attempt < retries) {
          attempt += 1;
          options.onProgress?.({ ...file, status: "retrying", error: message }, source, [...completed]);
          continue;
        }
        options.onProgress?.({ ...file, status: "failed", error: message }, source, [...completed]);
        throw error;
      }
    }
  }
  return { source, completedPaths: [...completed] };
}

export function orderBuildFiles(files: Array<{ path: string; purpose: string }>, options: { understanding?: ProjectUnderstanding | null } = {}): Array<{ path: string; purpose: string }> {
  const understanding = options.understanding;
  if (!understanding || files.length <= 1) return files;
  const byPath = new Map(files.map((f) => [f.path, f]));
  const paths = files.map((f) => f.path);
  const deps = new Map(paths.map((p) => [p, (understanding.dependencyGraph[p] ?? []).filter((d) => byPath.has(d))]));
  // Prefer dependency-first (generate imported foundations before consumers) with stable tie-breakers.
  const weight = (p: string) => {
    const file = understanding.files.find((f) => f.path === p);
    const role = file?.role;
    return role === "style" || role === "config" || role === "data" ? 0 : role === "util" || role === "hook" || role === "context" ? 1 : role === "component" ? 2 : role === "page" ? 3 : role === "entry" ? 4 : 5;
  };
  const visited = new Set<string>();
  const temp = new Set<string>();
  const out: string[] = [];
  const visit = (p: string) => {
    if (visited.has(p) || temp.has(p)) return;
    temp.add(p);
    for (const d of (deps.get(p) ?? []).sort((a, b) => weight(a) - weight(b) || a.localeCompare(b))) visit(d);
    temp.delete(p);
    visited.add(p);
    out.push(p);
  };
  for (const p of [...paths].sort((a, b) => weight(a) - weight(b) || a.localeCompare(b))) visit(p);
  return out.map((p) => byPath.get(p)!).filter(Boolean);
}
