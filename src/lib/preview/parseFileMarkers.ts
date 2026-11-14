// Parse "// FILE: <path>\n<content>" blocks. Returns { files, entry }.
export function normalizeFileMarkers(raw: string): string {
  return raw.replace(/^\s*#\s*FILE:/gim, "// FILE:");
}

export function formatFileMarkers(files: Record<string, string>): string {
  return Object.entries(files)
    .map(([path, content]) => `// FILE: ${path}\n${content}`)
    .join("\n\n");
}

export function parseFileMarkers(raw: string): { files: Record<string, string>; entry: string } | null {
  const normalized = normalizeFileMarkers(raw || "");
  if (!normalized || !/^\s*\/\/\s*FILE:/m.test(normalized)) return null;
  const files: Record<string, string> = {};
  const re = /(^|\n)\s*\/\/\s*FILE:\s*([^\n]+)\n([\s\S]*?)(?=\n\s*\/\/\s*FILE:\s*[^\n]+\n|\s*$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    const path = m[2].trim().replace(/^["'`]|["'`]$/g, "");
    files[path] = m[3].trim();
  }
  if (!Object.keys(files).length) return null;
  const entry =
    files["src/App.jsx"] ? "src/App.jsx" :
    files["src/App.tsx"] ? "src/App.tsx" :
    files["src/main.jsx"] ? "src/main.jsx" :
    Object.keys(files)[0];
  return { files, entry };
}

export function updateProjectFile(raw: string, path: string, content: string): string {
  const normalized = normalizeFileMarkers(raw);
  const parsed = parseFileMarkers(normalized);
  if (!parsed) {
    if (path !== "src/App.tsx" && path !== "src/App.jsx") {
      throw new Error(`Cannot update ${path}: the source does not contain a multi-file project.`);
    }
    return content;
  }
  if (!(path in parsed.files)) {
    throw new Error(`Cannot update ${path}: the file is not part of the project source.`);
  }

  return formatFileMarkers({ ...parsed.files, [path]: content });
}
