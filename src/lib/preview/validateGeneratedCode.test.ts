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

  it("detects cross-file export/import mismatches (generic synthetic modules)", () => {
    const missingDefault = `// FILE: src/App.tsx
import Widget from "./components/Widget";
export default function App() { return <Widget />; }

// FILE: src/components/Widget.tsx
export function Widget() { return <div />; }`;
    expect(validateGeneratedCode(missingDefault)).toContain("has no default export");

    const missingNamed = `// FILE: src/App.tsx
import { MissingThing } from "./lib/utils";
export default function App() { return <main>{String(MissingThing)}</main>; }

// FILE: src/lib/utils.ts
export const PresentThing = 1;`;
    expect(validateGeneratedCode(missingNamed)).toContain('does not export "MissingThing"');

    const incorrectNamed = `// FILE: src/App.tsx
import { helper as run } from "./lib/utils";
export default function App() { return <main>{run()}</main>; }

// FILE: src/lib/utils.ts
export function helperTwo() { return 1; }`;
    expect(validateGeneratedCode(incorrectNamed)).toContain('does not export "helper"');

    const validCrossFile = `// FILE: src/App.tsx
import { helper } from "./lib/utils";
import Card from "./components/Card";
export default function App() { return <Card value={helper()} />; }

// FILE: src/lib/utils.ts
export function helper() { return 1; }

// FILE: src/components/Card.tsx
export default function Card(props: { value: number }) { return <div>{props.value}</div>; }`;
    expect(validateGeneratedCode(validCrossFile)).toBeNull();
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

describe("placeholder detection", () => {
  it("rejects components that render an empty shell", () => {
    const source = `// FILE: src/App.tsx
import "./styles.css";
import Home from "./pages/Home";
export default function App() { return <Home />; }

// FILE: src/styles.css
body { margin: 0; }

// FILE: src/pages/Home.tsx
export default function Home() { return null; }`;
    expect(validateGeneratedCode(source, true)).toContain("empty placeholder");
  });

  it("rejects files with only placeholder copy", () => {
    const source = `// FILE: src/App.tsx
import "./styles.css";
import Home from "./pages/Home";
export default function App() { return <Home />; }

// FILE: src/styles.css
body { margin: 0; }

// FILE: src/pages/Home.tsx
export default function Home() { const title = "Your content here"; return <main>{title}</main>; }`;
    expect(validateGeneratedCode(source, true)).toContain("empty placeholder");
  });
});
