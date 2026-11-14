import { describe, expect, it } from "vitest";
import { formatFileMarkers, normalizeFileMarkers, parseFileMarkers, updateProjectFile } from "./parseFileMarkers";

describe("project source editing", () => {
  it("normalizes markdown-style file markers returned by repair models", () => {
    const source = `# FILE: src/App.tsx
export default function App() { return <main />; }

# FILE: src/styles.css
:root { color-scheme: dark; }`;

    const normalized = normalizeFileMarkers(source);
    expect(normalized).toContain("// FILE: src/App.tsx");
    expect(parseFileMarkers(normalized)?.files["src/styles.css"]).toContain("color-scheme: dark");
  });

  it("updates one file while preserving the rest of a multi-file project", () => {
    const source = `// FILE: src/App.tsx
import Header from "./Header";
export default function App() { return <Header />; }

// FILE: src/Header.tsx
export default function Header() { return <h1>Old</h1>; }`;

    const updated = updateProjectFile(
      source,
      "src/Header.tsx",
      "export default function Header() { return <h1>New</h1>; }"
    );
    const parsed = parseFileMarkers(updated);

    expect(parsed?.entry).toBe("src/App.tsx");
    expect(parsed?.files["src/App.tsx"]).toContain('import Header from "./Header"');
    expect(parsed?.files["src/Header.tsx"]).toContain("<h1>New</h1>");
  });

  it("accepts a complete single-file TSX source", () => {
    const source = "export default function App() { return <main>Old</main>; }";
    const updated = updateProjectFile(source, "src/App.tsx", "export default function App() { return <main>New</main>; }");

    expect(updated).toContain("<main>New</main>");
    expect(parseFileMarkers(updated)).toBeNull();
  });

  it("rejects updates to files that are not in the project", () => {
    expect(() => updateProjectFile("// FILE: src/App.tsx\nexport default function App() {}", "src/Missing.tsx", ""))
      .toThrow("the file is not part of the project source");
  });

  it("formats a complete nested file map into compatible markers", () => {
    const formatted = formatFileMarkers({
      "src/App.tsx": "export default function App() {}",
      "src/components/Button.tsx": "export const Button = () => null;",
    });
    expect(parseFileMarkers(formatted)?.files["src/components/Button.tsx"]).toContain("Button");
  });
});
