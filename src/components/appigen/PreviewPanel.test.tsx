import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewPanel } from "./PreviewPanel";

vi.mock("@monaco-editor/react", () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea aria-label="source editor" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

describe("PreviewPanel", () => {
  it("opens versions and restores/deletes through the versions area", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Versions (1)" }));

    expect(screen.getByText("Build another app")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete version Build another app" }));
    expect(onDeleteVersion).toHaveBeenCalledWith(expect.objectContaining({ id: "version-1" }));
  });

  it("shows only preview, code, and versions tabs", () => {
    render(
      <PreviewPanel
        isBuilding={false}
        doc=""
        code="export default function App(){ return <main>Hi</main>; }"
        baseCode=""
        onCodeChange={vi.fn()}
        versions={[]}
        onRestoreVersion={vi.fn()}
        onDeleteVersion={vi.fn()}
        onClearVersions={vi.fn()}
        onManualFix={vi.fn()}
        fixing={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Versions (0)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Changes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Quality/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /History/i })).not.toBeInTheDocument();
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

  it("shows a single preview without device controls", () => {
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

    expect(screen.queryByRole("button", { name: "Desktop" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tablet" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mobile" })).not.toBeInTheDocument();
    expect(screen.getByTitle("AppiGen Sandbox Preview")).toHaveClass("h-full", "w-full");
    expect(screen.getAllByTitle("Reload preview")).toHaveLength(1);
  });
});
