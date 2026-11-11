import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewPanel } from "./PreviewPanel";

vi.mock("@monaco-editor/react", () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea aria-label="source editor" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

describe("PreviewPanel", () => {
  it("opens version history and restores/deletes through the history area", () => {
    const onDeleteVersion = vi.fn();
    render(
      <PreviewPanel
        isBuilding={false}
        doc=""
        code=""
        onCodeChange={vi.fn()}
        versions={[{ id: "version-1", code: "", prompt: "Build another app", createdAt: 0 }]}
        onRestoreVersion={vi.fn()}
        onDeleteVersion={onDeleteVersion}
        onClearVersions={vi.fn()}
        onManualFix={vi.fn()}
        fixing={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "History (1)" }));

    expect(screen.getByText("Build another app")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete version Build another app" }));
    expect(onDeleteVersion).toHaveBeenCalledWith(expect.objectContaining({ id: "version-1" }));
  });

  it("shows added, modified, and unchanged project files in Changes", () => {
    const baseCode = "// FILE: src/App.tsx\nexport default function App() { return <main>Old</main>; }\n\n// FILE: src/lib/keep.ts\nexport const keep = true;";
    const code = "// FILE: src/App.tsx\nexport default function App() { return <main>New</main>; }\n\n// FILE: src/lib/keep.ts\nexport const keep = true;\n\n// FILE: src/lib/new.ts\nexport const added = true;";
    render(<PreviewPanel isBuilding={false} doc="" code={code} baseCode={baseCode} onCodeChange={vi.fn()} versions={[]} onRestoreVersion={vi.fn()} onDeleteVersion={vi.fn()} onClearVersions={vi.fn()} onManualFix={vi.fn()} fixing={false} />);
    expect(screen.queryByText("GitHub Push")).not.toBeInTheDocument();
    expect(screen.queryByText("Versions (0)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Changes" }));
    expect(screen.getByText("src/App.tsx")).toBeInTheDocument();
    expect(screen.getByText("modified")).toBeInTheDocument();
    expect(screen.getByText("unchanged")).toBeInTheDocument();
    expect(screen.getByText("added")).toBeInTheDocument();
    expect(screen.getByText(/New/)).toBeInTheDocument();
  });

  it("shows generated app layers, including the app stylesheet, in Code view", () => {
    const code = `// FILE: src/App.tsx
import "./styles.css";
import HomePage from "./pages/HomePage";
export default function App() { return <HomePage />; }

// FILE: src/pages/HomePage.tsx
import MainView from "../components/MainView";
export default function HomePage() { return <MainView />; }

// FILE: src/components/MainView.tsx
export default function MainView() { return <main>Ready</main>; }

// FILE: src/styles.css
:root { --accent: #2563eb; }`;

    render(
      <PreviewPanel
        isBuilding={false}
        doc=""
        code={code}
        onCodeChange={vi.fn()}
        versions={[]}
        onRestoreVersion={vi.fn()}
        onDeleteVersion={vi.fn()}
        onClearVersions={vi.fn()}
        onManualFix={vi.fn()}
        fixing={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Code" }));

    expect(screen.getByText("HomePage.tsx")).toBeInTheDocument();
    expect(screen.getByText("MainView.tsx")).toBeInTheDocument();
    expect(screen.getByText("styles.css")).toBeInTheDocument();
  });

  it("opens and saves an individual nested file without dropping sibling files", () => {
    const onCodeChange = vi.fn();
    const code = `// FILE: src/App.tsx
import "./styles.css";
export default function App() { return <Widget />; }

// FILE: src/components/Widget.tsx
export default function Widget() { return <main>Old</main>; }

// FILE: src/styles.css
main { color: red; }`;

    render(
      <PreviewPanel
        isBuilding={false}
        doc=""
        code={code}
        onCodeChange={onCodeChange}
        versions={[]}
        onRestoreVersion={vi.fn()}
        onDeleteVersion={vi.fn()}
        onClearVersions={vi.fn()}
        onManualFix={vi.fn()}
        fixing={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Code" }));
    fireEvent.click(screen.getByRole("button", { name: "Widget.tsx" }));
    expect(screen.getByRole("textbox", { name: "source editor" })).toHaveValue(
      "export default function Widget() { return <main>Old</main>; }",
    );
    fireEvent.change(screen.getByRole("textbox", { name: "source editor" }), {
      target: { value: "export default function Widget() { return <main>New</main>; }" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));

    expect(onCodeChange).toHaveBeenCalledWith(expect.stringContaining("src/styles.css"));
    expect(onCodeChange).toHaveBeenCalledWith(expect.stringContaining("<main>New</main>"));
  });

  it("allows user-triggered file downloads from the sandboxed preview", () => {
    render(
      <PreviewPanel
        isBuilding={false}
        doc=""
        code="export default function App() { return <main>Ready</main>; }"
        onCodeChange={vi.fn()}
        versions={[]}
        onRestoreVersion={vi.fn()}
        onDeleteVersion={vi.fn()}
        onClearVersions={vi.fn()}
        onManualFix={vi.fn()}
        fixing={false}
      />,
    );

    expect(screen.getByTitle("AppiGen Sandbox Preview").getAttribute("sandbox")).toContain("allow-downloads");
  });

  it("shows the generated empty preview skeleton before the first build", () => {
    render(
      <PreviewPanel
        isBuilding={false}
        doc=""
        code={null}
        versions={[]}
        onRestoreVersion={vi.fn()}
        onDeleteVersion={vi.fn()}
        onClearVersions={vi.fn()}
        onManualFix={vi.fn()}
        fixing={false}
      />,
    );

    expect(screen.getByText("AppiGen Generated")).toBeInTheDocument();
    expect(screen.getByText("Your generated app will appear here")).toBeInTheDocument();
  });

  it("shows responsive device preview controls and one reload control", () => {
    render(
      <PreviewPanel
        isBuilding={false}
        doc="<main>Ready</main>"
        code="export default function App() { return <main>Ready</main>; }"
        versions={[]}
        onRestoreVersion={vi.fn()}
        onDeleteVersion={vi.fn()}
        onClearVersions={vi.fn()}
        onManualFix={vi.fn()}
        fixing={false}
      />,
    );

    expect(screen.getByRole("button", { name: "Desktop" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tablet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mobile" })).toBeInTheDocument();
    expect(screen.getByTitle("AppiGen Sandbox Preview")).toHaveStyle({ width: "100%" });
    fireEvent.click(screen.getByRole("button", { name: "Tablet" }));
    expect(screen.getByRole("button", { name: "Tablet" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("AppiGen Sandbox Preview")).toHaveStyle({ width: "768px" });
    expect(screen.getAllByTitle("Reload preview")).toHaveLength(1);
  });
});
