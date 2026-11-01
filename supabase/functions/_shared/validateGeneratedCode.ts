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
]);

const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".css"];

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

function resolveLocalImport(fromPath: string, specifier: string, files: Map<string, string>): boolean {
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

  return files.has(target) ||
    EXTENSIONS.some((extension) => files.has(target + extension)) ||
    EXTENSIONS.some((extension) => files.has(`${target}/index${extension}`));
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
    const pagePaths = [...files.keys()].filter((path) => /^src\/pages\/.+\.tsx?$/.test(path));
    if (!pagePaths.length) {
      return "The generated project is missing a focused screen in src/pages/.";
    }
    const componentPaths = [...files.keys()].filter((path) => /^src\/components\/.+\.tsx?$/.test(path));
    if (!componentPaths.length) {
      return "The generated project is missing reusable UI in src/components/.";
    }
    const entrySource = files.get(entryPath)!;
    if (!/\bimport\s+["']\.\/styles\.css["']/.test(entrySource)) {
      return "src/App.tsx must import its app-specific ./styles.css.";
    }
    if (!pagePaths.some((path) => isImportedBy(path, entryPath, entrySource))) {
      return "src/App.tsx must compose a page from src/pages/.";
    }
    if (!componentPaths.some((path) => [...files!.entries()].some(([fromPath, content]) =>
      fromPath !== path && isImportedBy(path, fromPath, content)))) {
      return "A reusable component from src/components/ must be imported by the app.";
    }
  }

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

  const entry = files.get(entryPath)!;
  if (!/\bexport\s+default\b|\bexport\s*\{[^}]*\bdefault\b[^}]*\}/s.test(entry)) {
    return `${entryPath} must default-export the root App component.`;
  }
  return null;
}
