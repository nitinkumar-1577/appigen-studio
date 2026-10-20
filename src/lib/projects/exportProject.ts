import JSZip from "jszip";
import { parseFileMarkers } from "@/lib/preview/parseFileMarkers";

const safePath = (path: string) => {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.split("/").some((segment) => segment === "..")) return null;
  return normalized;
};

export function getExportFiles(code: string): Record<string, string> {
  const parsed = parseFileMarkers(code);
  if (!parsed) {
    const cleaned = code
      .replace(/<script[^>]*>[\s\S]*?__appigen[\s\S]*?<\/script>/gi, "")
      .replace(/^\s*ReactDOM\s*\.\s*createRoot\([\s\S]*?\.render\([\s\S]*?\)\s*;?\s*$/gm, "")
      .trim();
    return { "src/App.jsx": cleaned };
  }

  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(parsed.files)) {
    const safe = safePath(path);
    if (!safe || safe.endsWith(".html") && safe === "index.html") continue;
    files[safe] = content
      .replace(/<script[^>]*>[\s\S]*?__appigen[\s\S]*?<\/script>/gi, "")
      .replace(/^\s*ReactDOM\s*\.\s*createRoot\([\s\S]*?\.render\([\s\S]*?\)\s*;?\s*$/gm, "")
      .trim();
  }
  if (!files["src/App.jsx"] && !files["src/App.tsx"] && !files["src/main.jsx"]) {
    files["src/App.jsx"] = "export default function App() { return <main className=\"p-8\">App</main>; }";
  }
  return files;
}

export async function createRunnableProjectZip({ title, prompt, code }: { title: string; prompt: string; code: string }) {
  const zip = new JSZip();
  const files = getExportFiles(code);
  const appPath = files["src/App.tsx"] ? "App.tsx" : files["src/App.jsx"] ? "App.jsx" : "main.jsx";
  const entryPath = appPath.endsWith(".tsx") ? "src/main.tsx" : "src/main.jsx";
  const entryExtension = appPath.endsWith(".tsx") ? "tsx" : "jsx";
  const exportRoot = zip.folder(title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "appigen-app");
  if (!exportRoot) throw new Error("Could not create the project archive.");

  Object.entries(files).forEach(([path, contents]) => exportRoot.file(path, contents));
  if (!files["src/main.jsx"] && !files["src/main.tsx"]) {
    exportRoot.file(entryPath, `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./${appPath}";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
`);
  }
  if (!files["src/styles.css"]) {
    exportRoot.file("src/styles.css", "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
  } else {
    exportRoot.file("src/styles.css", `${files["src/styles.css"]}\n\n@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`);
  }
  exportRoot.file("index.html", `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>AppiGen app</title></head><body><div id="root"></div><script type="module" src="/src/main.${entryExtension}"></script></body></html>
`);
  exportRoot.file("package.json", JSON.stringify({
    name: "appigen-generated-app",
    private: true,
    version: "1.0.0",
    type: "module",
    scripts: { dev: "vite", build: "vite build", preview: "vite preview", typecheck: "tsc --noEmit -p tsconfig.app.json", test: "vitest run" },
    dependencies: {
      "date-fns": "4.1.0",
      "framer-motion": "11.15.0",
      "lucide-react": "0.468.0",
      "react": "18.3.1",
      "react-dom": "18.3.1",
      "react-router-dom": "6.30.1",
      "recharts": "2.15.0",
      "clsx": "2.1.1",
    },
    devDependencies: {
      "@types/react": "18.3.18",
      "@types/react-dom": "18.3.5",
      "@testing-library/jest-dom": "6.6.0",
      "@vitejs/plugin-react": "4.3.4",
      autoprefixer: "10.4.20",
      jsdom: "20.0.3",
      postcss: "8.4.49",
      tailwindcss: "3.4.16",
      typescript: "5.7.3",
      vite: "5.4.14",
      vitest: "2.1.8",
    },
  }, null, 2));
  exportRoot.file("vite.config.js", "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nimport path from 'node:path';\nimport { fileURLToPath } from 'node:url';\nconst root = path.dirname(fileURLToPath(import.meta.url));\nexport default defineConfig({ plugins: [react()], resolve: { alias: { '@': path.resolve(root, 'src') } } });\n");
  exportRoot.file("tailwind.config.js", "export default { content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'], theme: { extend: {} }, plugins: [] };\n");
  exportRoot.file("postcss.config.js", "export default { plugins: { tailwindcss: {}, autoprefixer: {} } };\n");
  exportRoot.file("tsconfig.json", JSON.stringify({ files: [], references: [{ path: "./tsconfig.app.json" }, { path: "./tsconfig.node.json" }] }, null, 2));
  exportRoot.file("tsconfig.app.json", JSON.stringify({
    compilerOptions: {
      target: "ES2020",
      useDefineForClassFields: true,
      lib: ["ES2020", "DOM", "DOM.Iterable"],
      module: "ESNext",
      skipLibCheck: true,
      moduleResolution: "Bundler",
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      moduleDetection: "force",
      noEmit: true,
      jsx: "react-jsx",
      strict: false,
      baseUrl: ".",
      paths: { "@/*": ["src/*"] },
    },
    include: ["src"],
  }, null, 2));
  exportRoot.file("tsconfig.node.json", JSON.stringify({
    compilerOptions: { target: "ES2022", lib: ["ES2023"], module: "ESNext", skipLibCheck: true, moduleResolution: "Bundler", allowImportingTsExtensions: true, noEmit: true },
    include: ["vite.config.js"],
  }, null, 2));
  exportRoot.file("src/vite-env.d.ts", '/// <reference types="vite/client" />\n');
  exportRoot.file("vitest.config.ts", `import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()], test: { environment: "jsdom", globals: true, setupFiles: ["./src/test/setup.ts"] } });
`);
  exportRoot.file("src/test/setup.ts", 'import "@testing-library/jest-dom/vitest";\n');
  exportRoot.file("src/test/smoke.test.ts", `import { describe, expect, it } from "vitest";

describe("generated app test setup", () => {
  it("runs in the configured DOM environment", () => {
    expect(document.createElement("main")).toBeInstanceOf(HTMLElement);
  });
});
`);
  exportRoot.file(".gitignore", "node_modules\ndist\n.env\n.env.*\n!.env.example\n");
  exportRoot.file("README.md", `# ${title}\n\nGenerated by AppiGen Studio.\n\n## Project structure\n\n- \`src/App.tsx\` — application shell and composition\n- \`src/pages/\` — focused screens\n- \`src/components/\` — reusable interface components\n- \`src/hooks/\` — stateful workflows\n- \`src/lib/\` — domain rules and utilities\n- \`src/styles.css\` — app-specific design system\n\n## Original prompt\n${prompt || "No prompt saved."}\n\n## Run locally\n\`\`\`sh\nnpm install\nnpm run dev\n\`\n\nRun \`npm run typecheck\` to check TypeScript, or \`npm run build\` to create the production bundle.\n`);
  return zip.generateAsync({ type: "blob" });
}