import { describe, expect, it } from "vitest";
import { formatUnderstandingForPrompt, impactedFiles, rankFilesForIntent, understandProject } from "./projectUnderstanding";

const source = `// FILE: src/App.tsx
import "./styles.css";
import HomePage from "./pages/HomePage";
export default function App() { return <HomePage />; }

// FILE: src/styles.css
body { margin: 0; }

// FILE: src/pages/HomePage.tsx
import Header from "../components/Header";
import { useNotes } from "../hooks/useNotes";
export default function HomePage() { const { notes } = useNotes(); return <main><Header />{notes.length}</main>; }

// FILE: src/components/Header.tsx
export default function Header() { return <h1>Notes</h1>; }

// FILE: src/hooks/useNotes.ts
import { loadNotes } from "../lib/notes";
export function useNotes() { return { notes: loadNotes() }; }

// FILE: src/lib/notes.ts
export function loadNotes() { return []; }
`;

describe("project understanding", () => {
  it("analyzes file roles, dependencies, and reverse dependencies", () => {
    const u = understandProject(source, "p1");
    expect(u?.fileCount).toBe(6);
    const app = u?.files.find((f) => f.path === "src/App.tsx");
    expect(app?.role).toBe("entry");
    expect(app?.dependsOn).toContain("src/styles.css");
    expect(app?.dependsOn).toContain("src/pages/HomePage.tsx");
    const hook = u?.files.find((f) => f.path === "src/hooks/useNotes.ts");
    expect(hook?.dependents).toContain("src/pages/HomePage.tsx");
    expect(u?.dependencyGraph["src/pages/HomePage.tsx"]).toEqual(expect.arrayContaining(["src/components/Header.tsx", "src/hooks/useNotes.ts"]));
    expect(u?.architectureSummary).toContain("files");
  });

  it("ranks and impacts files relevant to an edit intent", () => {
    const u = understandProject(source)!;
    const ranked = rankFilesForIntent(u, "fix the header title in notes page");
    expect(ranked[0]?.path).toMatch(/Header|HomePage|notes/i);
    const impacted = impactedFiles(u, ["src/components/Header.tsx"], 2);
    expect(impacted).toEqual(expect.arrayContaining(["src/components/Header.tsx", "src/pages/HomePage.tsx"]));
    const styleRanked = rankFilesForIntent(u, "change theme colors and layout");
    expect(styleRanked.some((r) => r.path === "src/styles.css")).toBe(true);
  });

  it("formats a prompt-safe understanding summary", () => {
    const u = understandProject(source)!;
    const text = formatUnderstandingForPrompt(u);
    expect(text).toContain("Project understanding");
    expect(text).toContain("src/App.tsx");
    expect(text).toContain("dependsOn");
  });
});
