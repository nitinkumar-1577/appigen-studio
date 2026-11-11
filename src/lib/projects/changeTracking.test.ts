import { describe, expect, it } from "vitest";
import { computeChangeRecord, formatChangeRecord, formatChangeRecordDetailed } from "./changeTracking";

describe("change tracking", () => {
  it("computes added, modified, removed and unchanged files with summary", () => {
    const before = `// FILE: src/App.tsx
export default function App(){ return <main>old</main>; }

// FILE: src/lib/keep.ts
export const keep = true;

// FILE: src/old.ts
export const gone = true;`;
    const after = `// FILE: src/App.tsx
export default function App(){ return <main>new</main>; }

// FILE: src/lib/keep.ts
export const keep = true;

// FILE: src/new.ts
export const added = true;`;
    const record = computeChangeRecord({ projectKey: "p1", before, after, prompt: "update app", reason: "edit" });
    expect(record.changedPaths.sort()).toEqual(["src/App.tsx", "src/new.ts", "src/old.ts"].sort());
    expect(record.addedPaths).toEqual(["src/new.ts"]);
    expect(record.removedPaths).toEqual(["src/old.ts"]);
    expect(record.unchangedCount).toBe(1);
    expect(record.summary).toContain("modified");
    const app = record.files.find((f) => f.path === "src/App.tsx");
    expect(app?.diff).toContain("- export default function App(){ return <main>old</main>; }");
    expect(app?.diff).toContain("+ export default function App(){ return <main>new</main>; }");
    expect(formatChangeRecord(record)).toContain("Preserved unchanged: 1");
    expect(formatChangeRecordDetailed(record)).toContain("[modified] src/App.tsx");
  });

  it("reports no content changes when sources match", () => {
    const src = `// FILE: src/App.tsx
export default function App(){ return null; }`;
    const record = computeChangeRecord({ projectKey: "p1", before: src, after: src, prompt: "noop" });
    expect(record.changedPaths).toEqual([]);
    expect(record.summary).toContain("No file content changes");
  });
});
