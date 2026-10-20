import { describe, expect, it } from "vitest";
import { validateGeneratedCode } from "./validateGeneratedCode";

describe("generated project validation", () => {
  it("accepts a complete multi-file project with resolved imports", () => {
    const source = `// FILE: src/App.tsx
import Header from "./components/Header";
export default function App() { return <Header />; }

// FILE: src/components/Header.tsx
export default function Header() { return <h1>Ready</h1>; }`;

    expect(validateGeneratedCode(source)).toBeNull();
  });

  it("requires separate page, reusable component, and stylesheet layers for new builds", () => {
    const source = `// FILE: src/App.tsx
import "./styles.css";
import HomePage from "./pages/HomePage";
export default function App() { return <HomePage />; }

// FILE: src/pages/HomePage.tsx
import CounterPanel from "../components/CounterPanel";
export default function HomePage() { return <CounterPanel />; }

// FILE: src/components/CounterPanel.tsx
export default function CounterPanel() { return <main>Counter</main>; }

// FILE: src/styles.css
:root { --accent: #2563eb; }`;

    expect(validateGeneratedCode(source, true)).toBeNull();
    expect(validateGeneratedCode(source.replace(/\/\/ FILE: src\/styles\.css[\s\S]*$/, ""), true))
      .toContain("missing src/styles.css");
    expect(validateGeneratedCode(source.replace('import HomePage from "./pages/HomePage";', 'import HomePage from "./UnusedPage";'), true))
      .toContain("must compose a page");
    expect(validateGeneratedCode(source.replace('import CounterPanel from "../components/CounterPanel";', 'const CounterPanel = () => <main />;'), true))
      .toContain("reusable component from src/components/");
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
