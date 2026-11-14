const ALLOWED_PACKAGES = new Set([
  "react",
  "react-dom",
  "react-dom/client",
  "lucide-react",
  "react-router-dom",
  "recharts",
  "framer-motion",
  "date-fns",
  "clsx",
  "@supabase/supabase-js",
]);

const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".css"];
const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

function bracketsBalanced(source: string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let quote: string | null = null;
  let template = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = null;
      continue;
    }
    if (template) {
      if (char === "\\") i++;
      else if (char === "`") template = false;
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      i++;
    } else if (char === "/" && next === "*") {
      blockComment = true;
      i++;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "`") {
      template = true;
    } else if ("([{".includes(char)) {
      stack.push(char);
    } else if (")]}".includes(char) && stack.pop() !== pairs[char]) {
      return false;
    }
  }

  return stack.length === 0 && !quote && !template && !blockComment;
}

function parseFiles(source: string): Map<string, string> | null {
  const markers = [...source.matchAll(/^\s*\/\/\s*FILE:\s*([^\n]+)\s*$/gm)];
  if (!markers.length) return null;

  const files = new Map<string, string>();
  markers.forEach((marker, index) => {
    const path = marker[1].trim().replace(/^["'`]|["'`]$/g, "");
    const start = marker.index! + marker[0].length;
    const end = markers[index + 1]?.index ?? source.length;
    if (!path || files.has(path)) throw new Error(`Invalid or duplicate file path: ${path || "(empty)"}`);
    files.set(path, source.slice(start, end).trim());
  });
  return files;
}

function resolveLocalImportPath(fromPath: string, specifier: string, files: Map<string, string>): string | null {
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

  if (files.has(target)) return target;
  for (const extension of EXTENSIONS) if (files.has(target + extension)) return target + extension;
  for (const extension of SOURCE_EXTENSIONS) if (files.has(`${target}/index${extension}`)) return `${target}/index${extension}`;
  return null;
}

function resolveLocalImport(fromPath: string, specifier: string, files: Map<string, string>): boolean {
  return resolveLocalImportPath(fromPath, specifier, files) !== null;
}

function isImportedBy(targetPath: string, fromPath: string, source: string): boolean {
  const extensionlessTarget = targetPath.replace(/\.(tsx?|jsx?)$/, "");
  const relativeTarget = extensionlessTarget.slice(0, extensionlessTarget.lastIndexOf("/"));
  const filename = extensionlessTarget.slice(extensionlessTarget.lastIndexOf("/") + 1);
  const relativeFrom = fromPath.slice(0, fromPath.lastIndexOf("/"));
  const fromParts = relativeFrom.split("/").filter(Boolean);
  const targetParts = relativeTarget.split("/").filter(Boolean);
  while (fromParts.length && targetParts.length && fromParts[0] === targetParts[0]) {
    fromParts.shift();
    targetParts.shift();
  }
  const specifier = `${"../".repeat(fromParts.length)}${targetParts.length ? `${targetParts.join("/")}/` : ""}${filename}`;
  const imports = [...source.matchAll(/\b(?:from\s*|import\s*)["']([^"']+)["']/g)].map((match) =>
    match[1].replace(/\.(tsx?|jsx?)$/, ""),
  );
  return imports.some((value) =>
    value === `./${specifier}` ||
    value === specifier ||
    value === `@/${targetPath.slice(4).replace(/\.(tsx?|jsx?)$/, "")}`,
  );
}

function stripCommentsAndStrings(source: string): string {
  let out = "";
  let quote: string | null = null;
  let template = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];
    if (lineComment) { if (char === "\n") { lineComment = false; out += "\n"; } else out += " "; continue; }
    if (blockComment) { if (char === "*" && next === "/") { blockComment = false; out += "  "; i++; } else out += char === "\n" ? "\n" : " "; continue; }
    if (quote) { if (char === "\\") { out += "  "; i++; } else if (char === quote) { quote = null; out += " "; } else out += char === "\n" ? "\n" : " "; continue; }
    if (template) { if (char === "\\") { out += "  "; i++; } else if (char === "`") { template = false; out += " "; } else out += char === "\n" ? "\n" : char; continue; }
    if (char === "/" && next === "/") { lineComment = true; out += "  "; i++; }
    else if (char === "/" && next === "*") { blockComment = true; out += "  "; i++; }
    else if (char === '"' || char === "'") { quote = char; out += " "; }
    else if (char === "`") { template = true; out += " "; }
    else out += char;
  }
  return out;
}

interface ModuleExports { hasDefault: boolean; named: Set<string>; all: boolean }
interface ImportBinding { defaultName?: string; namespace?: boolean; named: string[] }

function analyzeExports(content: string): ModuleExports {
  const src = stripCommentsAndStrings(content);
  const named = new Set<string>();
  let hasDefault = /\bexport\s+default\b/.test(src) || /\bexport\s*\{[^}]*\bdefault\b(?:\s+as\s+\w+)?[^}]*\}/.test(src);
  for (const m of src.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var|enum|interface|type)\s+([A-Za-z_$][\w$]*)/g)) named.add(m[1]);
  for (const m of src.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    const from = /\bfrom\s*["'][^"']+["']/.test(src.slice(m.index ?? 0, (m.index ?? 0) + m[0].length + 40));
    for (const part of m[1].split(",")) {
      const trimmed = part.trim(); if (!trimmed) continue;
      const bits = trimmed.split(/\s+as\s+/i).map((s) => s.trim()).filter(Boolean);
      if (!bits.length) continue;
      const exported = (bits[1] ?? bits[0]).replace(/^type\s+/, "");
      if (exported === "default") hasDefault = true;
      else if (exported && !from) named.add(exported);
      else if (exported && from) named.add(exported);
    }
  }
  return { hasDefault, named, all: /\bexport\s+\*/.test(src) };
}

function parseImportBindings(clause: string): ImportBinding {
  const c = clause.trim();
  const binding: ImportBinding = { named: [] };
  if (!c) return binding;
  if (/^\*\s+as\s+/.test(c)) { binding.namespace = true; return binding; }
  const namedMatch = c.match(/\{([^}]*)\}/);
  if (namedMatch) {
    for (const part of namedMatch[1].split(",")) {
      const trimmed = part.trim(); if (!trimmed) continue;
      const bits = trimmed.split(/\s+as\s+/i).map((s) => s.trim());
      const imported = (bits[0] ?? "").replace(/^type\s+/, "");
      if (imported) binding.named.push(imported);
    }
    const before = c.slice(0, namedMatch.index).replace(/,\s*$/, "").trim();
    if (before && !before.startsWith("{")) binding.defaultName = before.replace(/^type\s+/, "");
  } else {
    const first = c.split(",")[0]?.trim() ?? "";
    if (first.startsWith("* as ")) binding.namespace = true;
    else if (first) binding.defaultName = first.replace(/^type\s+/, "");
  }
  return binding;
}

function validateCrossFileImports(path: string, content: string, files: Map<string, string>, exportCache: Map<string, ModuleExports>): string | null {
  const importRe = /\bimport\s+(?:type\s+)?([\s\S]*?)\bfrom\s*["']([^"']+)["']/g;
  for (const m of content.matchAll(importRe)) {
    const clause = m[1] ?? "";
    const specifier = m[2] ?? "";
    // Guard against malformed capture spanning side-effect/adjacent import statements
    if (/;\s*import\b/.test(clause) || /^\s*["']/.test(clause)) continue;
    if (!(specifier.startsWith(".") || specifier.startsWith("@/") || specifier.startsWith("/"))) continue;
    const resolved = resolveLocalImportPath(path, specifier, files);
    if (!resolved) return `Generated file ${path} imports missing module "${specifier}".`;
    if (!SOURCE_EXTENSIONS.some((ext) => resolved.endsWith(ext))) continue;
    const targetContent = files.get(resolved) ?? "";
    let mod = exportCache.get(resolved);
    if (!mod) { mod = analyzeExports(targetContent); exportCache.set(resolved, mod); }
    if (mod.all) continue; // export * - cannot prove absence
    const binding = parseImportBindings(clause);
    if (binding.namespace) continue;
    if (binding.defaultName && !mod.hasDefault) {
      return `Generated file ${path} default-imports "${binding.defaultName}" from "${specifier}", but ${resolved} has no default export.`;
    }
    for (const name of binding.named) {
      if (name === "default") {
        if (!mod.hasDefault) return `Generated file ${path} imports default as named from "${specifier}", but ${resolved} has no default export.`;
        continue;
      }
      if (!mod.named.has(name)) {
        return `Generated file ${path} imports "${name}" from "${specifier}", but ${resolved} does not export "${name}".`;
      }
    }
  }
  return null;
}


function findPlaceholderFile(files: Map<string, string>): string | null {
  for (const [path, content] of files) {
    if (!/\.(tsx|jsx)$/.test(path)) continue;
    if (!/^src\/(?:pages|components)\//.test(path)) continue;
    const stripped = stripCommentsAndStrings(content)
      .replace(/^\s*import\s[^;\n]*;?/gm, "")
      .replace(/^\s*export\s+(?:default\s+)?(?:type|interface)\s[^\n]*/gm, "")
      .replace(/\bexport\s+default\s+/g, "")
      .replace(/\bexport\s+/g, "")
      .trim();
    const jsxElements = (stripped.match(/<[A-Za-z][\w.]*/g) ?? []).length;
    const placeholderCue = /(?:TODO|FIXME|lorem ipsum|coming soon|generated app|your content here)/i.test(content);
    if ((jsxElements === 0 && (placeholderCue || stripped.length < 40)) || (placeholderCue && jsxElements <= 1)) {
      return `Generated file ${path} is an empty placeholder with no real UI.`;
    }
  }
  return null;
}

export function validateGeneratedCode(source: string, requireArchitecture = false): string | null {
  if (!source.trim()) return "The AI returned empty source code.";
  if (/^\s*[#*]\s*FILE:/mi.test(source)) {
    return 'The generated project used an invalid file delimiter. Use "// FILE: <path>" for each project file.';
  }

  let files: Map<string, string> | null;
  try {
    files = parseFiles(source);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  if (!files) {
    if (!bracketsBalanced(source)) return "The generated source has unbalanced brackets or an unclosed string.";
    if (!/\b(?:function|const|let|var)\s+App\b/.test(source)) {
      return "The generated single-file source does not define an App component.";
    }
    return null;
  }

  const entryPath = ["src/App.tsx", "src/App.jsx"].find((path) => files?.has(path));
  if (!entryPath) return "The generated project is missing src/App.tsx or src/App.jsx.";

  if (requireArchitecture) {
    if (!files.has("src/styles.css")) return "The generated project is missing src/styles.css for its app-specific design system.";
    const entrySource = files.get(entryPath)!;
    if (!/\bimport\s+["']\.\/styles\.css["']/.test(entrySource)) {
      return "src/App.tsx must import its app-specific ./styles.css.";
    }
    const pagePaths = [...files.keys()].filter((path) => /^src\/pages\/.+\.tsx?$/.test(path));
    const componentPaths = [...files.keys()].filter((path) => /^src\/components\/.+\.tsx?$/.test(path));
    const hookPaths = [...files.keys()].filter((path) => /^src\/hooks\/.+\.[jt]sx?$/.test(path));
    const utilPaths = [...files.keys()].filter((path) => /^src\/lib\/.+\.[jt]sx?$/.test(path));
    if (files.size >= 6 && pagePaths.length === 0 && componentPaths.length === 0 && hookPaths.length === 0 && utilPaths.length === 0) {
      return "A larger generated project must organize requested behavior into focused modules such as pages, components, hooks, or lib utilities.";
    }
    if (pagePaths.length > 0 && !pagePaths.some((path) => isImportedBy(path, entryPath, entrySource))) {
      return "src/App.tsx must compose a planned screen from src/pages/.";
    }
  }

  const exportCache = new Map<string, ModuleExports>();
  for (const [path, content] of files) {
    if (!content) return `Generated file ${path} is empty.`;
    if (!bracketsBalanced(content)) return `Generated file ${path} has unbalanced brackets or an unclosed string.`;

    const imports = content.matchAll(/\b(?:from\s*|import\s*)["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g);
    for (const match of imports) {
      const specifier = match[1] ?? match[2];
      if (specifier.startsWith(".") || specifier.startsWith("@/") || specifier.startsWith("/")) {
        if (!resolveLocalImport(path, specifier, files)) {
          return `Generated file ${path} imports missing module "${specifier}".`;
        }
      } else if (!ALLOWED_PACKAGES.has(specifier)) {
        return `Generated file ${path} imports unsupported package "${specifier}".`;
      }
    }
  }

  for (const [path, content] of files) {
    const cross = validateCrossFileImports(path, content, files, exportCache);
    if (cross) return cross;
  }

  const entry = files.get(entryPath)!;
  if (!/\bexport\s+default\b|\bexport\s*\{[^}]*\bdefault\b[^}]*\}/s.test(entry)) {
    return `${entryPath} must default-export the root App component.`;
  }
  const placeholder = findPlaceholderFile(files);
  if (placeholder) return placeholder;
  return null;
}

export function validateGeneratedFile(path: string, content: string, knownPaths: string[] = []): string | null {
  if (!/^(src|public)\/(?!.*(?:^|\/)\.\.?\/)[A-Za-z0-9_./-]+\.(?:tsx?|jsx?|css|html|json|svg)$/.test(path) || path.includes("..")) {
    return `Unsafe project path: ${path}`;
  }
  if (!content.trim()) return `Generated file ${path} is empty.`;
  if (!bracketsBalanced(content)) return `Generated file ${path} has unbalanced brackets or an unclosed string.`;
  const files = new Map(knownPaths.map((knownPath) => [knownPath, ""]));
  files.set(path, content);
  for (const match of content.matchAll(/\b(?:from\s*|import\s*)["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    const specifier = match[1] ?? match[2];
    if (specifier.startsWith(".") || specifier.startsWith("@/") || specifier.startsWith("/")) {
      if (!resolveLocalImport(path, specifier, files)) return `Generated file ${path} imports missing module "${specifier}".`;
    } else if (!ALLOWED_PACKAGES.has(specifier)) {
      return `Generated file ${path} imports unsupported package "${specifier}".`;
    }
  }
  return null;
}
