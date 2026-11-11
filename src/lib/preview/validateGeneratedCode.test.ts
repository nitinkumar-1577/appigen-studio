import { describe, expect, it } from "vitest";
import { validateGeneratedCode } from "./validateGeneratedCode";

describe("generated project validation", () => {
  it("accepts a complete multi-file project with resolved imports", () => {
    const source = `// FILE: src/App.tsx
import "./styles.css";
import Header from "./components/Header";
export default function App() { return <Header />; }

// FILE: src/styles.css
body { margin: 0; }

// FILE: src/components/Header.tsx
export default function Header() { return <h1>Ready</h1>; }`;

    expect(validateGeneratedCode(source)).toBeNull();
  });

  it("allows simple adaptive builds without forcing pages/components structure", () => {
    const source = `// FILE: src/App.tsx
import "./styles.css";
export default function App() { return <main>Timer</main>; }

// FILE: src/styles.css
:root { color-scheme: dark; }`;

    expect(validateGeneratedCode(source, true)).toBeNull();
  });

  it("requires coherent organization for larger multi-file builds, but not for focused small projects", () => {
    const focusedSmall = `// FILE: src/App.tsx
import "./styles.css";
import { compute } from "./lib/compute";
export default function App() { return <main>{compute(1)}</main>; }

// FILE: src/styles.css
body { margin: 0; }

// FILE: src/lib/compute.ts
export const compute = (value: number) => value + 1;`;
    expect(validateGeneratedCode(focusedSmall, true)).toBeNull();

    const withoutStyles = `// FILE: src/App.tsx
export default function App() { return <main />; }
// FILE: src/pages/HomePage.tsx
export default function HomePage() { return <main />; }
// FILE: src/components/Card.tsx
export default function Card() { return <div />; }
// FILE: src/lib/data.ts
export const data = [];
// FILE: src/hooks/useData.ts
export const useData = () => data;
// FILE: src/components/List.tsx
export default function List() { return <div />; }`;
    expect(validateGeneratedCode(withoutStyles, true)).toContain("missing src/styles.css");

    const withoutModules = `// FILE: src/App.tsx
import "./styles.css";
export default function App() { return <main />; }
// FILE: src/styles.css
body {}
// FILE: src/a.ts
export const a = 1;
// FILE: src/b.ts
export const b = 2;
// FILE: src/c.ts
export const c = 3;
// FILE: src/d.ts
export const d = 4;
// FILE: src/e.ts
export const e = 5;`;
    expect(validateGeneratedCode(withoutModules, true)).toContain("focused modules");
  });

  it("accepts packages supplied by the preview runtime", () => {
    const source = `// FILE: src/App.tsx
import { LineChart } from "recharts";
export default function App() { return <LineChart />; }`;

    expect(validateGeneratedCode(source)).toBeNull();
  });

  it("rejects missing entry files and unresolved imports", () => {
    expect(validateGeneratedCode(`// FILE: src/Other.tsx
export default function Other() { return <main />; }`))
      .toContain("missing src/App.tsx");

    expect(validateGeneratedCode(`// FILE: src/App.tsx
import Header from "./components/Header";
export default function App() { return <Header />; }`))
      .toContain('imports missing module "./components/Header"');
  });

  it("rejects unsupported packages and malformed source", () => {
    expect(validateGeneratedCode(`// FILE: src/App.tsx
import { useState } from "react";
import { Button } from "some-ui-kit";
export default function App() { return <button />; }`))
      .toContain('unsupported package "some-ui-kit"');

    expect(validateGeneratedCode(`// FILE: src/App.tsx
export default function App() { return (<main />; }`))
      .toContain("unbalanced brackets");

    expect(validateGeneratedCode(`# FILE: src/App.tsx
export default function App() { return <main />; }`))
      .toContain("invalid file delimiter");
  });

  it("accepts the legacy single-file component format", () => {
    expect(validateGeneratedCode(`function App() { return <main>Ready</main>; }
ReactDOM.createRoot(document.getElementById("root")).render(<App />);`))
      .toBeNull();
  });
});
