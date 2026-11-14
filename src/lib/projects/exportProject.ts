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
    if (!safe || (safe.endsWith(".html") && safe === "index.html")) continue;
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

export interface ExportBackendOptions {
  mode?: "shared" | "dedicated";
  generatedAppId?: string;
  supabaseUrl?: string | null;
  supabaseAnonKey?: string | null;
  publicEnv?: Record<string, string>;
  envExample?: Record<string, string>;
}

export async function createRunnableProjectZip({ title, prompt, code, backend }: { title: string; prompt: string; code: string; backend?: ExportBackendOptions }) {
  const zip = new JSZip();
  const files = getExportFiles(code);
  const needsSupabase = Boolean(backend?.mode) || /@supabase\/supabase-js|generated_app_data|supabase\.from/.test(code);
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
  const dependencies: Record<string, string> = {
    "date-fns": "4.1.0",
    "framer-motion": "11.15.0",
    "lucide-react": "0.468.0",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-router-dom": "6.30.1",
    "recharts": "2.15.0",
    "clsx": "2.1.1",
  };
  if (needsSupabase) dependencies["@supabase/supabase-js"] = "2.49.4";
  exportRoot.file("package.json", JSON.stringify({
    name: "appigen-generated-app",
    private: true,
    version: "1.0.0",
    type: "module",
    scripts: { dev: "vite", build: "vite build", preview: "vite preview", typecheck: "tsc --noEmit -p tsconfig.app.json", test: "vitest run" },
    dependencies,
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

  // Backend-aware export: include only non-secret/public env hints and never raw private secrets.
  const envExampleLines: string[] = [];
  const needsBackendConfig = needsSupabase || Boolean(backend?.mode);
  if (needsBackendConfig) {
    envExampleLines.push("# Generated app backend configuration (non-secret/public values only)");
    envExampleLines.push("# Never commit .env or private secrets. Configure private keys server-side or in your deployment provider's secret store.");
    envExampleLines.push(`VITE_SUPABASE_URL=${backend?.supabaseUrl ?? ""}`);
    envExampleLines.push(`VITE_SUPABASE_PUBLISHABLE_KEY=${backend?.supabaseAnonKey ?? ""}`);
    if (backend?.generatedAppId) envExampleLines.push(`VITE_APPIGEN_GENERATED_APP_ID=${backend.generatedAppId}`);
    if (backend?.mode) envExampleLines.push(`VITE_APPIGEN_BACKEND_MODE=${backend.mode}`);
  }
  const extraEnv = backend?.envExample ?? backend?.publicEnv ?? {};
  for (const [k, v] of Object.entries(extraEnv)) {
    if (/secret|token|password|service_role|private/i.test(k)) continue;
    if (!envExampleLines.some((l) => l.startsWith(`${k}=`))) envExampleLines.push(`${k}=${v ?? ""}`);
  }
  if (envExampleLines.length) exportRoot.file(".env.example", envExampleLines.join("\n") + "\n");

  if (backend?.mode === "shared" || /generated_app_data/.test(code)) {
    exportRoot.file("src/lib/appigenSharedBackend.ts", `import { createClient } from "@supabase/supabase-js";

// Shared-backend integration scaffold for generated apps.
// Uses AppiGen shared Supabase with strict per-app/per-owner RLS isolation (generated_app_data).
// Configure public URL/publishable key via environment variables. Never embed service-role/private secrets.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const generatedAppId = import.meta.env.VITE_APPIGEN_GENERATED_APP_ID as string | undefined;
export const supabase = url && key ? createClient(url, key) : null;

export async function listSharedRecords(collection: string) {
  if (!supabase || !generatedAppId) throw new Error("Shared backend is not configured (missing Supabase env or generated app id).");
  const { data: auth } = await supabase.auth.getUser();
  const ownerId = auth.user?.id;
  if (!ownerId) throw new Error("Authenticated user required for tenant-isolated shared backend access.");
  const { data, error } = await supabase.from("generated_app_data").select("id,record,created_at,updated_at").eq("generated_app_id", generatedAppId).eq("owner_id", ownerId).eq("collection", collection).order("updated_at", { ascending: false });
  if (error) throw error; return data ?? [];
}
export async function createSharedRecord(collection: string, record: Record<string, unknown>) {
  if (!supabase || !generatedAppId) throw new Error("Shared backend is not configured.");
  const { data: auth } = await supabase.auth.getUser();
  const ownerId = auth.user?.id; if (!ownerId) throw new Error("Authenticated user required.");
  const { data, error } = await supabase.from("generated_app_data").insert({ generated_app_id: generatedAppId, owner_id: ownerId, collection, record }).select("id,record,created_at,updated_at").single();
  if (error) throw error; return data;
}
`);
  }

  const backendReadme = needsBackendConfig ? `

## Backend integration
- Mode: **${backend?.mode ?? "configured"}** (shared = AppiGen shared Supabase with per-app/per-owner RLS isolation; dedicated = independent Supabase project when provisioned/connected).
- Configure public values in \`.env\` from \`.env.example\`. Private secrets must be stored server-side / in deployment secret stores and never committed.
- Shared tenant-isolated CRUD scaffold: \`src/lib/appigenSharedBackend.ts\` (requires authenticated user and applied AppiGen migrations for \`generated_app_data\`).
- Dedicated provisioning/deployment require external credentials and provider-confirmed execution; this export does not contain service-role keys.
` : "";

  exportRoot.file(".gitignore", "node_modules\ndist\n.env\n.env.*\n!.env.example\n");
  exportRoot.file("README.md", `# ${title}

Generated by AppiGen Studio.

## Project structure

- \`src/App.tsx\` — application shell and composition
- \`src/pages/\` — focused screens
- \`src/components/\` — reusable interface components
- \`src/hooks/\` — stateful workflows
- \`src/lib/\` — domain rules and utilities
- \`src/styles.css\` — app-specific design system

## Original prompt
${prompt || "No prompt saved."}${backendReadme}

## Run locally
\`\`\`sh
npm install
${envExampleLines.length ? "cp .env.example .env\n" : ""}npm run dev
\`\`\`

Run \`npm run typecheck\` to check TypeScript, or \`npm run build\` to create the production bundle.
`);
  return zip.generateAsync({ type: "blob" });
}

export async function getRunnableProjectFiles(input: { title: string; prompt: string; code: string; backend?: ExportBackendOptions }): Promise<Record<string, string>> {
  const folderName = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "appigen-app";
  const archive = await JSZip.loadAsync(await createRunnableProjectZip(input));
  const files: Record<string, string> = {};
  await Promise.all(Object.entries(archive.files).map(async ([path, file]) => {
    if (!file.dir && path.startsWith(`${folderName}/`)) {
      files[path.slice(folderName.length + 1)] = await file.async("string");
    }
  }));
  if (!Object.keys(files).length) throw new Error("The generated project archive contained no files.");
  return files;
}
