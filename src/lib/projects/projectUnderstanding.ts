import { parseFileMarkers } from "@/lib/preview/parseFileMarkers";

export type FileRole = "entry" | "page" | "component" | "hook" | "context" | "util" | "style" | "data" | "config" | "api" | "backend" | "test" | "asset" | "other";
export type ProjectArea = "frontend" | "state" | "domain" | "styling" | "routing" | "data" | "api" | "backend" | "auth" | "config" | "test" | "other";

export interface FileUnderstanding {
  path: string;
  role: FileRole;
  areas: ProjectArea[];
  summary: string;
  imports: string[];
  exports: string[];
  importedBy: string[];
  dependsOn: string[];
  dependents: string[];
  externalDependencies: string[];
  size: number;
}

export interface ProjectUnderstanding {
  projectId: string | null;
  fileCount: number;
  files: FileUnderstanding[];
  entryPoints: string[];
  keyModules: string[];
  dependencyGraph: Record<string, string[]>;
  reverseDependencyGraph: Record<string, string[]>;
  areas: Record<ProjectArea, string[]>;
  routes: string[];
  components: string[];
  hooks: string[];
  contexts: string[];
  utils: string[];
  styles: string[];
  apis: string[];
  dataFiles: string[];
  architectureSummary: string;
}

const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".css", ".json", ".html", ".svg"];
const STOP = new Set(["the", "and", "for", "with", "please", "make", "add", "update", "change", "modify", "this", "that", "into", "from", "app", "project", "file", "code", "button", "page", "component", "fix", "improve", "create", "build", "want", "need", "should", "have", "when", "user", "users", "back", "work", "working", "like", "same", "also", "keep", "existing"]);

function uniq<T>(items: T[]): T[] { return [...new Set(items)]; }

export function tokenizeIntent(text: string): string[] {
  return uniq((text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? []).filter((w) => !STOP.has(w)));
}

function resolveLocalImport(fromPath: string, specifier: string, known: Set<string>): string | null {
  let target = specifier.startsWith("@/")
    ? `src/${specifier.slice(2)}`
    : specifier.startsWith("/")
      ? specifier.slice(1)
      : `${fromPath.slice(0, Math.max(0, fromPath.lastIndexOf("/")))}${fromPath.includes("/") ? "/" : ""}${specifier}`;
  const parts: string[] = [];
  for (const part of target.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  target = parts.join("/");
  if (known.has(target)) return target;
  for (const ext of EXTENSIONS) if (known.has(target + ext)) return target + ext;
  for (const ext of [".tsx", ".ts", ".jsx", ".js"]) if (known.has(`${target}/index${ext}`)) return `${target}/index${ext}`;
  return null;
}

function extractImports(content: string): { local: string[]; external: string[] } {
  const local: string[] = [];
  const external: string[] = [];
  const add = (specRaw: string) => {
    const spec = specRaw.trim();
    if (!spec) return;
    if (spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("/")) local.push(spec);
    else external.push(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
  };
  for (const match of content.matchAll(/\b(?:import|export)\s+(?:type\s+)?[\s\S]*?\bfrom\s*["']([^"']+)["']/g)) add(match[1] ?? "");
  for (const match of content.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) add(match[1] ?? "");
  for (const match of content.matchAll(/^\s*import\s*["']([^"']+)["']/gm)) add(match[1] ?? "");
  return { local: uniq(local), external: uniq(external) };
}

function extractExports(content: string): string[] {
  const names = new Set<string>();
  for (const m of content.matchAll(/\bexport\s+(?:default\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of content.matchAll(/\bexport\s*\{([^}]+)\}/g)) for (const part of m[1].split(",")) { const n = part.trim().split(/\s+as\s+/i)[0]?.trim(); if (n) names.add(n); }
  if (/export\s+default\b/.test(content)) names.add("default");
  return [...names];
}

function roleFor(path: string, content: string): FileRole {
  if (/\/App\.(tsx|jsx)$/.test(path) || /\/main\.(tsx|jsx)$/.test(path)) return "entry";
  if (/\.css$/.test(path)) return "style";
  if (/\.(test|spec)\.[jt]sx?$/.test(path)) return "test";
  if (/\/pages\/|\/routes?\//.test(path)) return "page";
  if (/\/components\//.test(path)) return "component";
  if (/\/hooks\//.test(path) || /\/use[A-Z]/.test(path)) return "hook";
  if (/\/contexts?\//.test(path) || /Context\.[jt]sx?$/.test(path)) return "context";
  if (/\/(api|server|functions|supabase\/functions)\//.test(path) || /route\.[jt]s$/.test(path)) return "api";
  if (/\/(db|database|migrations|schema|prisma)\//.test(path) || /supabase/i.test(content)) return "backend";
  if (/\/(lib|utils?|helpers?|services?)\//.test(path)) return "util";
  if (/\/(data|fixtures|seed|sample)\//.test(path) || /\.json$/.test(path)) return "data";
  if (/config|vite\.|tailwind|tsconfig|package\.json/.test(path)) return "config";
  if (/\.(svg|png|jpg|jpeg|webp|ico)$/.test(path)) return "asset";
  if (/export\s+default\s+function\b/.test(content) && /<[A-Z]/.test(content)) return "component";
  return "other";
}

function areasFor(path: string, role: FileRole, content: string): ProjectArea[] {
  const areas = new Set<ProjectArea>();
  if (role === "style") areas.add("styling");
  if (role === "component" || role === "page" || role === "entry") areas.add("frontend");
  if (role === "hook" || role === "context" || /\buse(State|Reducer|Context|Memo|Callback|Effect)\b/.test(content)) areas.add("state");
  if (role === "util" || role === "data") areas.add("domain");
  if (role === "data") areas.add("data");
  if (role === "page" || /react-router|Route|Link|useNavigate|useParams/.test(content)) areas.add("routing");
  if (role === "api" || /\bfetch\(|\/api\/|supabase\.functions/.test(content)) areas.add("api");
  if (role === "backend" || /supabase|postgres|sql|prisma|drizzle/i.test(content)) areas.add("backend");
  if (/auth|login|sign.?in|sign.?up|session|jwt|supabase\.auth/i.test(`${path} ${content}`)) areas.add("auth");
  if (role === "config") areas.add("config");
  if (role === "test") areas.add("test");
  if (areas.size === 0) areas.add("other");
  return [...areas];
}

function summarize(path: string, role: FileRole, content: string, exportsList: string[]): string {
  const base = path.split("/").pop() ?? path;
  const exported = exportsList.filter((e) => e !== "default").slice(0, 4).join(", ");
  const hint = /auth|login/i.test(content) ? "auth flow" : /route|router/i.test(content) ? "routing" : /fetch|api/i.test(content) ? "data fetching" : /form|input/i.test(content) ? "forms/inputs" : /table|list|grid/i.test(content) ? "listing UI" : /chart|graph/i.test(content) ? "visualization" : "";
  return [role, base, exported ? `exports: ${exported}` : "", hint].filter(Boolean).join(" · ");
}

export function understandProject(source: string, projectId: string | null = null): ProjectUnderstanding | null {
  const parsed = parseFileMarkers(source);
  if (!parsed) return null;
  const paths = Object.keys(parsed.files);
  const known = new Set(paths);
  const base: Array<Omit<FileUnderstanding, "importedBy" | "dependents"> & { localSpecs: string[] }> = paths.map((path) => {
    const content = parsed.files[path] ?? "";
    const { local, external } = extractImports(content);
    const exportsList = extractExports(content);
    const role = roleFor(path, content);
    const dependsOn = uniq(local.map((s) => resolveLocalImport(path, s, known)).filter((p): p is string => Boolean(p)));
    return {
      path, role, areas: areasFor(path, role, content), summary: summarize(path, role, content, exportsList),
      imports: local, exports: exportsList, dependsOn, externalDependencies: external, size: content.length, localSpecs: local,
    };
  });
  const reverse: Record<string, string[]> = Object.fromEntries(paths.map((p) => [p, []]));
  for (const file of base) for (const dep of file.dependsOn) { if (!reverse[dep]) reverse[dep] = []; reverse[dep].push(file.path); }
  for (const key of Object.keys(reverse)) reverse[key] = uniq(reverse[key]);
  const files: FileUnderstanding[] = base.map(({ localSpecs: _l, ...file }) => ({
    ...file,
    importedBy: reverse[file.path] ?? [],
    dependents: reverse[file.path] ?? [],
  }));
  const dependencyGraph = Object.fromEntries(files.map((f) => [f.path, f.dependsOn]));
  const areas = {} as Record<ProjectArea, string[]>;
  for (const a of ["frontend","state","domain","styling","routing","data","api","backend","auth","config","test","other"] as ProjectArea[]) areas[a] = [];
  for (const f of files) for (const a of f.areas) areas[a].push(f.path);
  const byRole = (r: FileRole) => files.filter((f) => f.role === r).map((f) => f.path);
  const entryPoints = files.filter((f) => f.role === "entry" || /\/main\./.test(f.path)).map((f) => f.path);
  const keyModules = uniq([...entryPoints, ...byRole("page").slice(0, 4), ...byRole("api").slice(0, 3), ...files.filter((f) => (reverse[f.path]?.length ?? 0) >= 2).slice(0, 5).map((f) => f.path)]);
  const architectureSummary = [
    `${files.length} files`,
    byRole("page").length ? `pages: ${byRole("page").slice(0,4).join(", ")}` : "single-screen/entry UI",
    byRole("component").length ? `${byRole("component").length} components` : "",
    byRole("hook").length ? `${byRole("hook").length} hooks` : "",
    areas.api.length ? "API/data-fetch present" : "",
    areas.backend.length || areas.auth.length ? "backend/auth signals" : "client-only/local state",
  ].filter(Boolean).join("; ");
  const routes = files.filter((f) => f.role === "page" || /route|router/i.test(f.path)).map((f) => f.path);
  return {
    projectId, fileCount: files.length, files, entryPoints, keyModules, dependencyGraph, reverseDependencyGraph: reverse,
    areas, routes, components: byRole("component"), hooks: byRole("hook"), contexts: byRole("context"), utils: byRole("util"), styles: byRole("style"), apis: byRole("api"), dataFiles: byRole("data"),
    architectureSummary,
  };
}

export function impactedFiles(understanding: ProjectUnderstanding, targets: string[], depth = 2): string[] {
  const out = new Set(targets.filter((t) => understanding.dependencyGraph[t] || understanding.reverseDependencyGraph[t]));
  let frontier = [...out];
  for (let i = 0; i < depth; i++) {
    const next: string[] = [];
    for (const path of frontier) {
      for (const dep of understanding.reverseDependencyGraph[path] ?? []) if (!out.has(dep)) { out.add(dep); next.push(dep); }
    }
    frontier = next;
  }
  return [...out];
}

export function rankFilesForIntent(understanding: ProjectUnderstanding, prompt: string): Array<{ path: string; score: number; reasons: string[] }> {
  const tokens = tokenizeIntent(prompt);
  const text = prompt.toLowerCase();
  const wantsStyle = /style|css|color|theme|dark|light|layout|responsive|font|design|button|ui|look/.test(text);
  const wantsAuth = /auth|login|sign.?in|sign.?up|logout|password|session/.test(text);
  const wantsData = /data|api|fetch|save|persist|database|supabase|backend/.test(text);
  const wantsRoute = /route|routing|page|navigation|nav|screen|tab/.test(text);
  const wantsLogic = /state|hook|logic|behavior|bug|error|crash|broken|not working|doesn'?t work/.test(text);
  return understanding.files.map((file) => {
    let score = 0; const reasons: string[] = [];
    const hay = `${file.path} ${file.summary}`.toLowerCase();
    for (const t of tokens) if (hay.includes(t)) { score += 3; reasons.push(`matches:${t}`); }
    if (wantsStyle && file.role === "style") { score += 6; reasons.push("style-intent"); }
    if (wantsStyle && /button|ui|component/i.test(text) && file.role === "component") { score += 2; reasons.push("ui-style"); }
    if (wantsAuth && file.areas.includes("auth")) { score += 6; reasons.push("auth-intent"); }
    if (wantsData && (file.areas.includes("api") || file.areas.includes("backend") || file.areas.includes("data"))) { score += 5; reasons.push("data-intent"); }
    if (wantsRoute && (file.areas.includes("routing") || file.role === "page")) { score += 5; reasons.push("route-intent"); }
    if (wantsLogic && (file.role === "hook" || file.areas.includes("state"))) { score += 4; reasons.push("logic-intent"); }
    if (wantsLogic && file.role === "util") { score += 2; reasons.push("util-logic"); }
    if (file.role === "entry" && (wantsRoute || /home|main|app\b/.test(text))) { score += 2; reasons.push("entry"); }
    if ((understanding.reverseDependencyGraph[file.path]?.length ?? 0) >= 2) score += 1;
    return { path: file.path, score, reasons };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

export function formatUnderstandingForPrompt(u: ProjectUnderstanding, limit = 40): string {
  const lines = [`Project understanding: ${u.architectureSummary}`, `Entry: ${u.entryPoints.join(", ") || "n/a"}`, `Key modules: ${u.keyModules.join(", ") || "n/a"}`];
  for (const f of u.files.slice(0, limit)) {
    const deps = f.dependsOn.length ? ` dependsOn:[${f.dependsOn.join(", ")}]` : "";
    const used = f.dependents.length ? ` usedBy:[${f.dependents.slice(0,4).join(", ")}]` : "";
    lines.push(`- ${f.path} (${f.role}; ${f.areas.join(",")}): ${f.summary}${deps}${used}`);
  }
  return lines.join("\n");
}
