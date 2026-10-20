import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewPanel } from "./PreviewPanel";

vi.mock("@monaco-editor/react", () => ({ default: () => null }));

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

  it("allows user-triggered file downloads from the sandboxed preview", () => {
    render(
      <PreviewPanel
        isBuilding={false}
        doc=""
        code=""
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
});
