import { formatFileMarkers, parseFileMarkers } from "@/lib/preview/parseFileMarkers";

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

export function selectFilesForEdit(source: string, prompt: string): string[] {
  const parsed = parseFileMarkers(source);
  if (!parsed) return ["src/App.tsx"];
  const words = (prompt.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? [])
    .filter((word) => !new Set(["the", "and", "for", "with", "please", "make", "add", "update", "change", "modify", "this", "that", "into", "from", "app"]).has(word));
  const ranked = Object.entries(parsed.files).map(([path, content]) => ({
    path,
    score: words.reduce((score, word) => score + (`${path} ${content}`.toLowerCase().includes(word) ? 1 : 0), 0),
  })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score);
  if (ranked.length) return ranked.slice(0, Math.max(1, Math.min(5, ranked.length))).map(({ path }) => path);
  const likely = ["src/App.tsx", "src/App.jsx", "src/styles.css"].filter((path) => Object.hasOwn(parsed.files, path));
  return likely.length ? likely : [Object.keys(parsed.files)[0]];
}

export async function runSequentialFileBuild<T>(options: {
  files: Array<{ path: string; purpose: string }>;
  initialSource: string;
  completedPaths?: string[];
  signal: AbortSignal;
  generate: (file: { path: string; purpose: string }) => Promise<T>;
  validate: (file: { path: string; purpose: string }, result: T, source: string) => void;
  merge: (source: string, file: { path: string; purpose: string }, result: T) => string;
  onProgress?: (file: BuildFileProgress, source: string, completedPaths: string[]) => void;
}) {
  let source = options.initialSource;
  const completed = new Set(options.completedPaths ?? []);
  for (const file of options.files) {
    if (completed.has(file.path)) continue;
    if (options.signal.aborted) throw new DOMException("Build stopped", "AbortError");
    options.onProgress?.({ ...file, status: "generating" }, source, [...completed]);
    try {
      const result = await options.generate(file);
      options.onProgress?.({ ...file, status: "validating" }, source, [...completed]);
      options.validate(file, result, source);
      source = options.merge(source, file, result);
      completed.add(file.path);
      options.onProgress?.({ ...file, status: "completed" }, source, [...completed]);
    } catch (error) {
      options.onProgress?.({ ...file, status: "failed", error: error instanceof Error ? error.message : String(error) }, source, [...completed]);
      throw error;
    }
  }
  return { source, completedPaths: [...completed] };
}
