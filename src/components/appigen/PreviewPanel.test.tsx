import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewPanel } from "./PreviewPanel";

vi.mock("@monaco-editor/react", () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea aria-label="source editor" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

describe("PreviewPanel", () => {
  it("opens the version list without crashing", () => {
    render(
      <PreviewPanel
        isBuilding={false}
        doc=""
        code=""
        onPushToGithub={vi.fn()}
        onCodeChange={vi.fn()}
        versions={[{ id: "version-1", code: "", prompt: "Build another app", createdAt: 0 }]}
        onRestoreVersion={vi.fn()}
        onManualFix={vi.fn()}
        fixing={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Versions (1)" }));

    expect(screen.getByText("Build another app")).toBeInTheDocument();
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
        onPushToGithub={vi.fn()}
        onCodeChange={vi.fn()}
        versions={[]}
        onRestoreVersion={vi.fn()}
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
        onPushToGithub={vi.fn()}
        onCodeChange={onCodeChange}
        versions={[]}
        onRestoreVersion={vi.fn()}
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onCodeChange).toHaveBeenCalledWith(expect.stringContaining("src/styles.css"));
    expect(onCodeChange).toHaveBeenCalledWith(expect.stringContaining("<main>New</main>"));
  });

  it("allows user-triggered file downloads from the sandboxed preview", () => {
    render(
      <PreviewPanel
        isBuilding={false}
        doc=""
        code="export default function App() { return <main>Ready</main>; }"
        onPushToGithub={vi.fn()}
        onCodeChange={vi.fn()}
        versions={[]}
        onRestoreVersion={vi.fn()}
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
        onPushToGithub={vi.fn()}
        versions={[]}
        onRestoreVersion={vi.fn()}
        onManualFix={vi.fn()}
        fixing={false}
      />,
    );

    expect(screen.getByText("AppiGen Generated")).toBeInTheDocument();
    expect(screen.getByText("Your generated app will appear here")).toBeInTheDocument();
  });

  it("shows a full-width preview with reload", () => {
    render(
      <PreviewPanel
        isBuilding={false}
        doc="<main>Ready</main>"
        code="export default function App() { return <main>Ready</main>; }"
        onPushToGithub={vi.fn()}
        versions={[]}
        onRestoreVersion={vi.fn()}
        onManualFix={vi.fn()}
        fixing={false}
      />,
    );

    expect(screen.queryByRole("button", { name: "Desktop" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tablet" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mobile" })).not.toBeInTheDocument();
    expect(screen.getByTitle("AppiGen Sandbox Preview")).toHaveStyle({ width: "100%" });
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });
});
