import { describe, expect, it } from "vitest";
import { mergeGeneratedFile, orderBuildFiles, runSequentialFileBuild, validateBuildFileResponse, validateFileTree } from "./buildWorkflow";

describe("Phase 3 build engine", () => {
  it("validates exact planned file responses and safe paths", () => {
    expect(validateBuildFileResponse({ path: "src/App.tsx", content: "export default function App() { return null; }" }, "src/App.tsx").path).toBe("src/App.tsx");
    expect(() => validateBuildFileResponse({ path: "src/Other.tsx", content: "x" }, "src/App.tsx")).toThrow();
    expect(() => validateBuildFileResponse({ path: "../secret.ts", content: "x" }, "../secret.ts")).toThrow();
  });

  it("merges generated files without dropping unrelated existing files", () => {
    const base = "// FILE: src/App.tsx\nexport default function App(){return 1}\n\n// FILE: src/lib/keep.ts\nexport const keep = true;";
    const merged = mergeGeneratedFile(base, "src/App.tsx", "export default function App(){return 2}");
    expect(merged).toContain("return 2");
    expect(merged).toContain("src/lib/keep.ts");
    expect(merged).toContain("export const keep = true");
  });

  it("validates file tree completeness and rejects unsafe/duplicate/missing files", () => {
    const tree = "// FILE: src/App.tsx\nexport default function App(){}\n\n// FILE: src/styles.css\nbody{}";
    expect(validateFileTree(tree, ["src/App.tsx", "src/styles.css"])).toBeNull();
    expect(validateFileTree(tree, ["src/App.tsx", "src/missing.tsx"])).toContain("Missing required");
    expect(validateFileTree("// FILE: ../bad.ts\nx", [])).toContain("Unsafe");
  });

  it("orders files by dependency/role so foundations generate before consumers", () => {
    const files = [
      { path: "src/App.tsx", purpose: "entry" },
      { path: "src/components/Header.tsx", purpose: "ui" },
      { path: "src/lib/helpers.ts", purpose: "util" },
      { path: "src/styles.css", purpose: "style" },
    ];
    const understanding = {
      dependencyGraph: {
        "src/App.tsx": ["src/components/Header.tsx", "src/styles.css"],
        "src/components/Header.tsx": ["src/lib/helpers.ts"],
        "src/lib/helpers.ts": [],
        "src/styles.css": [],
      },
      reverseDependencyGraph: {},
      files: [
        { path: "src/App.tsx", role: "entry" },
        { path: "src/components/Header.tsx", role: "component" },
        { path: "src/lib/helpers.ts", role: "util" },
        { path: "src/styles.css", role: "style" },
      ],
    } as unknown as Parameters<typeof orderBuildFiles>[1]["understanding"];
    const ordered = orderBuildFiles(files, { understanding }).map((f) => f.path);
    expect(ordered.indexOf("src/lib/helpers.ts")).toBeLessThan(ordered.indexOf("src/components/Header.tsx"));
    expect(ordered.indexOf("src/styles.css")).toBeLessThan(ordered.indexOf("src/App.tsx"));
  });

  it("retries a failed file, preserves completed work, and resumes only incomplete files", async () => {
    let attempts = 0;
    const events: string[] = [];
    const first = await runSequentialFileBuild({
      files: [
        { path: "src/styles.css", purpose: "styles" },
        { path: "src/App.tsx", purpose: "entry" },
      ],
      initialSource: "",
      signal: new AbortController().signal,
      retries: 1,
      generate: async (file) => {
        if (file.path === "src/App.tsx") {
          attempts += 1;
          if (attempts === 1) throw new Error("temporary failure");
          return { content: "export default function App(){return null}" };
        }
        return { content: file.path === "src/styles.css" ? "body{}" : "" };
      },
      validate: () => {},
      merge: (source, file, result) => mergeGeneratedFile(source, file.path, result.content),
      onProgress: (p) => events.push(`${p.status}:${p.path}`),
    });
    expect(attempts).toBe(2);
    expect(events).toContain("completed:src/styles.css");
    expect(events).toContain("retrying:src/App.tsx");
    expect(first.completedPaths).toEqual(["src/styles.css", "src/App.tsx"]);

    const resumed = await runSequentialFileBuild({
      files: [
        { path: "src/styles.css", purpose: "styles" },
        { path: "src/App.tsx", purpose: "entry" },
        { path: "src/lib/extra.ts", purpose: "extra" },
      ],
      initialSource: first.source,
      completedPaths: first.completedPaths,
      signal: new AbortController().signal,
      generate: async (file) => ({ content: `export const x = "${file.path}";` }),
      validate: () => {},
      merge: (source, file, result) => mergeGeneratedFile(source, file.path, result.content),
    });
    expect(resumed.source).toContain("body{}");
    expect(resumed.completedPaths).toEqual(["src/styles.css", "src/App.tsx", "src/lib/extra.ts"]);
  });
});
