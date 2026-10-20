import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createRunnableProjectZip, getExportFiles } from "./exportProject";

describe("generated project export files", () => {
  it("writes every safe FILE marker as its own file", () => {
    const files = getExportFiles("// FILE: src/App.jsx\nexport default function App() { return null; }\n\n// FILE: src/components/Tile.jsx\nexport default function Tile() { return null; }");
    expect(Object.keys(files)).toEqual(["src/App.jsx", "src/components/Tile.jsx"]);
  });

  it("does not allow file markers to escape the export folder", () => {
    const files = getExportFiles("// FILE: ../outside.js\nmalicious content\n\n// FILE: src/App.jsx\nexport default function App() { return null; }");
    expect(files["../outside.js"]).toBeUndefined();
  });

  it("preserves app CSS and creates a matching TSX entry point in the runnable archive", async () => {
    const code = `// FILE: src/App.tsx
import "./styles.css";
export default function App() { return <main className="custom-shell">Ready</main>; }

// FILE: src/styles.css
.custom-shell { color: rebeccapurple; }`;
    const blob = await createRunnableProjectZip({ title: "Styled app", prompt: "Build a styled app", code });
    const archive = await JSZip.loadAsync(blob);

    const styles = await archive.file("styled-app/src/styles.css")?.async("string");
    const entry = await archive.file("styled-app/src/main.tsx")?.async("string");
    const index = await archive.file("styled-app/index.html")?.async("string");
    const packageJson = await archive.file("styled-app/package.json")?.async("string");
    const tsconfig = await archive.file("styled-app/tsconfig.app.json")?.async("string");
    const vitest = await archive.file("styled-app/vitest.config.ts")?.async("string");
    const gitignore = await archive.file("styled-app/.gitignore")?.async("string");

    expect(styles).toContain(".custom-shell { color: rebeccapurple; }");
    expect(entry).toContain('import App from "./App.tsx"');
    expect(index).toContain("/src/main.tsx");
    expect(packageJson).toContain('"react-router-dom"');
    expect(packageJson).toContain('"typecheck"');
    expect(tsconfig).toContain('"@/*": [');
    expect(vitest).toContain('environment: "jsdom"');
    expect(gitignore).toContain("node_modules");
  });
});