// Parse "// FILE: <path>\n<content>" blocks. Returns { files, entry }.
export function parseFileMarkers(raw: string): { files: Record<string, string>; entry: string } | null {
  if (!raw || !/^\s*\/\/\s*FILE:/m.test(raw)) return null;
  const files: Record<string, string> = {};
  const re = /(^|\n)\s*\/\/\s*FILE:\s*([^\n]+)\n([\s\S]*?)(?=\n\s*\/\/\s*FILE:\s*[^\n]+\n|\s*$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
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
