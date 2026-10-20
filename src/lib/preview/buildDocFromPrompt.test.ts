import { describe, expect, it } from "vitest";
import { buildDocFromPrompt } from "./buildDocFromPrompt";

describe("preview document generation", () => {
  it("transforms multi-file TSX with React and lucide runtime shims", () => {
    const doc = buildDocFromPrompt(
      "A small typed app",
      `// FILE: src/App.tsx
import { useState } from "react";
import { Sparkles } from "lucide-react";
type Props = { title: string };
export default function App({ title }: Props) {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}><Sparkles />{title}: {count}</button>;
}`
    );

    expect(doc).toContain("src/App.tsx");
    expect(doc).toContain("presets.push(['typescript'");
    expect(doc).toContain("isTSX:");
    expect(doc).toContain(".tsx$/.test(path)");
    expect(doc).toContain("'lucide-react': lucideProxy");
    expect(doc).toContain("React.createElement(PreviewErrorBoundary");
    expect(doc).toContain("window.__appigenReport('render'");
    expect(doc).toContain("stack?'\\n\\n'+stack");
    expect(doc).toContain("https://cdn.tailwindcss.com");
    expect(doc).toContain("https://unpkg.com/prop-types@15.8.1/prop-types.min.js");
    expect(doc).toContain("React.PropTypes = PropTypes;");
    expect(doc.indexOf("react.development.js")).toBeLessThan(doc.indexOf("Recharts.js"));
    const inlineScripts = [...doc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    expect(inlineScripts).toHaveLength(3);
    for (const script of inlineScripts) expect(() => new Function(script)).not.toThrow();
  });

  it("keeps imports in legacy single-file TSX source for runtime module resolution", () => {
    const doc = buildDocFromPrompt(
      "Single file",
      `import { useState } from "react";
export default function App() {
  const [value, setValue] = useState<string>("");
  return <input value={value} onChange={(event) => setValue(event.target.value)} />;
}`
    );

    expect(doc).toContain('"src/App.tsx"');
    expect(doc).toContain('import { useState } from \\"react\\";');
    expect(doc).toContain("export default function App()");
  });

  it("shows a neutral empty preview instead of an unrelated sample app", () => {
    const doc = buildDocFromPrompt("");

    expect(doc).toContain("Describe an app and build it to see your preview here.");
    expect(doc).not.toContain("Sketch the layout");
    expect(doc).not.toContain("task manager");
  });

  it("allows imports backed by the preview runtime shims", () => {
    const doc = buildDocFromPrompt(
      "A chart",
      `import { LineChart } from "recharts";
export default function App() { return <LineChart />; }`
    );

    expect(doc).not.toContain("Unsupported package: recharts");
  });

  it("loads app-specific CSS files and supports importing them from the app entry", () => {
    const doc = buildDocFromPrompt(
      "A styled app",
      `// FILE: src/App.tsx
import "./styles.css";
export default function App() { return <main className="app-shell">Ready</main>; }

// FILE: src/styles.css
:root { --app-accent: #2563eb; }
.app-shell { color: var(--app-accent); }
.app-shell::after { content: "</script>"; }`,
    );

    expect(doc).toContain('"src/styles.css"');
    expect(doc).toContain('data-appigen-file');
    expect(doc).toContain('--app-accent: #2563eb');
    expect(doc).toContain("\\u003c/script>");
    expect(doc).not.toContain('content: "</script>"');
    expect(doc).toContain("target+'.css'");
    expect(doc).toContain("if (/\\.css$/i.test(path))");
    const inlineScripts = [...doc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    for (const script of inlineScripts) expect(() => new Function(script)).not.toThrow();
  });
});
