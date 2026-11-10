import { describe, expect, it, vi } from "vitest";
import { mergeGeneratedFile, runSequentialFileBuild, validateBuildFileResponse, validateFileTree } from "./buildWorkflow";

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
