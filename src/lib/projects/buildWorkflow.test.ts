import { describe, expect, it, vi } from "vitest";
import { mergeGeneratedFile, runSequentialFileBuild, selectFilesForEdit, validateBuildFileResponse, validateFileTree } from "./buildWorkflow";

describe("sequential build file contracts", () => {
  it("accepts only a non-empty response for the exact planned path", () => {
    expect(validateBuildFileResponse({ path: "src/App.tsx", content: "export default function App() {}", provider: "groq:model" }, "src/App.tsx").content).toContain("function App");
    expect(() => validateBuildFileResponse({ path: "src/Other.tsx", content: "ok" }, "src/App.tsx")).toThrow("Expected src/App.tsx");
    expect(() => validateBuildFileResponse({ path: "src/App.tsx", content: " " }, "src/App.tsx")).toThrow("empty file");
    expect(() => validateBuildFileResponse({ path: "../secret.ts", content: "x" }, "../secret.ts")).toThrow("Unsafe");
  });

  it("merges a changed file and leaves unrelated source intact", () => {
    const original = "// FILE: src/App.tsx\nexport default function App() { return null }\n\n// FILE: src/lib/data.ts\nexport const keep = true;";
    const result = mergeGeneratedFile(original, "src/App.tsx", "export default function App() { return <main /> }");
    expect(result).toContain("return <main />");
    expect(result).toContain("export const keep = true;");
  });

  it("checks every planned file and rejects unsafe or missing paths", () => {
    const source = "// FILE: src/App.tsx\nexport default function App() {}\n\n// FILE: src/styles.css\nbody {}";
    expect(validateFileTree(source, ["src/App.tsx", "src/styles.css"])).toBeNull();
    expect(validateFileTree(source, ["src/lib/missing.ts"])).toContain("Missing required");
    expect(validateFileTree("// FILE: ../escape.ts\nx", [])).toContain("Unsafe");
  });

  it("generates files sequentially and emits real per-file lifecycle events", async () => {
    const events: string[] = [];
    const result = await runSequentialFileBuild({
      files: [{ path: "src/App.tsx", purpose: "entry" }, { path: "src/styles.css", purpose: "styles" }],
      initialSource: "",
      signal: new AbortController().signal,
      generate: async (file) => { events.push(`request:${file.path}`); return { content: file.path }; },
      validate: () => {},
      merge: (source, file, response) => mergeGeneratedFile(source, file.path, response.content),
      onProgress: (file) => events.push(`${file.status}:${file.path}`),
    });
    expect(events).toEqual([
      "generating:src/App.tsx", "request:src/App.tsx", "validating:src/App.tsx", "completed:src/App.tsx",
      "generating:src/styles.css", "request:src/styles.css", "validating:src/styles.css", "completed:src/styles.css",
    ]);
    expect(result.completedPaths).toEqual(["src/App.tsx", "src/styles.css"]);
  });

  it("preserves completed file output when cancellation occurs between requests", async () => {
    const controller = new AbortController();
    const first = { path: "src/App.tsx", purpose: "entry" };
    let partialCode = "";
    await expect(runSequentialFileBuild({
      files: [first, { path: "src/styles.css", purpose: "styles" }],
      initialSource: "",
      signal: controller.signal,
      generate: async () => ({ content: "export default function App() {}" }),
      validate: () => {},
      merge: (source, file, response) => mergeGeneratedFile(source, file.path, response.content),
      onProgress: (file, source) => { if (file.status === "completed") { partialCode = source; controller.abort(); } },
    })).rejects.toThrow("Build stopped");
    expect(partialCode).toContain("src/App.tsx");
  });

  it("resumes only completed paths and keeps unrelated files during incremental edits", async () => {
    const original = "// FILE: src/App.tsx\nexport default function App() {}\n\n// FILE: src/lib/keep.ts\nexport const keep = 1;";
    const result = await runSequentialFileBuild({
      files: [{ path: "src/App.tsx", purpose: "entry" }, { path: "src/lib/new.ts", purpose: "new feature" }],
      initialSource: original,
      completedPaths: ["src/App.tsx"],
      signal: new AbortController().signal,
      generate: async (file) => ({ content: `export const name = "${file.path}";` }),
      validate: () => {},
      merge: (source, file, response) => mergeGeneratedFile(source, file.path, response.content),
    });
    expect(result.completedPaths).toEqual(["src/App.tsx", "src/lib/new.ts"]);
    expect(result.source).toContain("src/lib/keep.ts");
    expect(result.source).toContain("src/lib/new.ts");
  });

  it("does not merge a file when its validation fails", async () => {
    const merge = vi.fn((source: string) => source);
    await expect(runSequentialFileBuild({
      files: [{ path: "src/App.tsx", purpose: "entry" }],
      initialSource: "// FILE: src/App.tsx\nexport default function App() {}",
      signal: new AbortController().signal,
      generate: async () => ({ content: "incomplete" }),
      validate: () => { throw new Error("validation failed"); },
      merge,
    })).rejects.toThrow("validation failed");
    expect(merge).not.toHaveBeenCalled();
  });
});

  it("selects affected and dependent files for targeted edits without touching unrelated modules", () => {
    const source = `// FILE: src/App.tsx
import "./styles.css";
import HomePage from "./pages/HomePage";
export default function App(){ return <HomePage/>; }

// FILE: src/styles.css
body { margin: 0; }

// FILE: src/pages/HomePage.tsx
import Header from "../components/Header";
export default function HomePage(){ return <Header/>; }

// FILE: src/components/Header.tsx
export default function Header(){ return <h1>Old</h1>; }

// FILE: src/lib/unrelated.ts
export const value = 1;`;
    const selected = selectFilesForEdit(source, "fix the header title");
    expect(selected).toContain("src/components/Header.tsx");
    expect(selected).not.toContain("src/lib/unrelated.ts");

    const style = selectFilesForEdit(source, "change the theme colors and layout");
    expect(style).toContain("src/styles.css");
    expect(style).not.toContain("src/lib/unrelated.ts");
  });

  it("prefers recently changed files for ambiguous follow-ups", () => {
    const source = `// FILE: src/App.tsx
export default function App(){ return null; }

// FILE: src/components/LoginForm.tsx
export default function LoginForm(){ return null; }

// FILE: src/lib/unrelated.ts
export const value = 1;`;
    const selected = selectFilesForEdit(source, "revert the previous change", { recentlyChanged: ["src/components/LoginForm.tsx"] });
    expect(selected[0]).toBe("src/components/LoginForm.tsx");
    expect(selected).not.toContain("src/lib/unrelated.ts");
  });

  it("orders build files by dependency role before consumers", async () => {
    const { orderBuildFiles } = await import("./buildWorkflow");
    const files = [
      { path: "src/App.tsx", purpose: "entry" },
      { path: "src/components/Header.tsx", purpose: "ui" },
      { path: "src/lib/helpers.ts", purpose: "util" },
      { path: "src/styles.css", purpose: "style" },
    ];
    const understanding = {
      dependencyGraph: { "src/App.tsx": ["src/components/Header.tsx", "src/styles.css"], "src/components/Header.tsx": ["src/lib/helpers.ts"], "src/lib/helpers.ts": [], "src/styles.css": [] },
      reverseDependencyGraph: {}, files: [
        { path: "src/App.tsx", role: "entry" },
        { path: "src/components/Header.tsx", role: "component" },
        { path: "src/lib/helpers.ts", role: "util" },
        { path: "src/styles.css", role: "style" },
      ],
    } as unknown as Parameters<typeof orderBuildFiles>[1]["understanding"];
    const ordered = orderBuildFiles(files, { understanding });
    expect(ordered.map((f) => f.path).indexOf("src/lib/helpers.ts")).toBeLessThan(ordered.map((f) => f.path).indexOf("src/components/Header.tsx"));
    expect(ordered.map((f) => f.path).indexOf("src/styles.css")).toBeLessThan(ordered.map((f) => f.path).indexOf("src/App.tsx"));
  });

  it("retries a failing file once and then completes without duplicating merges", async () => {
    let attempts = 0;
    const progress: string[] = [];
    const result = await runSequentialFileBuild({
      files: [{ path: "src/App.tsx", purpose: "entry" }],
      initialSource: "",
      signal: new AbortController().signal,
      retries: 1,
      generate: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary provider timeout");
        return { content: "export default function App(){ return null }" };
      },
      validate: () => {},
      merge: (source, file, response) => mergeGeneratedFile(source, file.path, response.content),
      onProgress: (file) => progress.push(file.status),
    });
    expect(attempts).toBe(2);
    expect(progress).toContain("retrying");
    expect(result.completedPaths).toEqual(["src/App.tsx"]);
  });
