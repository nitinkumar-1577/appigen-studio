import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PromptPanel, speechRecognitionErrorMessage } from "./PromptPanel";
import type { ChatMessage } from "@/lib/projects/projectStorage";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));

class MockSpeechRecognition {
  static latest: MockSpeechRecognition | null = null;
  lang = "";
  interimResults = false;
  continuous = false;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    MockSpeechRecognition.latest = this;
  }
}

const props = () => ({
  onBuild: vi.fn(),
  onDownload: vi.fn(),
  onStop: vi.fn(),
  onNewProject: vi.fn(),
  isBuilding: false,
  progressStage: "Planning",
  buildFiles: [],
  buildTimeline: [],
  messages: [],
  hasCode: false,
  prompt: "",
  onPromptChange: vi.fn(),
});

describe("PromptPanel voice input", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: MockSpeechRecognition });
  });

  it("explains common microphone failures", () => {
    expect(speechRecognitionErrorMessage("not-allowed")).toContain("Allow microphone access");
    expect(speechRecognitionErrorMessage("audio-capture")).toContain("No microphone was found");
    expect(speechRecognitionErrorMessage("no-speech")).toContain("No speech was detected");
    expect(speechRecognitionErrorMessage("aborted")).toBe("");
  });

  it("starts recognition and reports a permission error clearly", () => {
    render(<PromptPanel {...props()} hasCode />);
    fireEvent.click(screen.getByRole("button", { name: "Add voice prompt" }));

    expect(MockSpeechRecognition.latest?.start).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Stop voice recording" })).toBeInTheDocument();

    act(() => {
      MockSpeechRecognition.latest?.onerror?.({ error: "not-allowed" });
    });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Mic error",
      description: expect.stringContaining("Allow microphone access"),
    }));
    expect(screen.getByRole("button", { name: "Add voice prompt" })).toBeInTheDocument();
  });
});

describe("PromptPanel file activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: MockSpeechRecognition });
  });

  const activityProps = () => ({
    ...props(),
    isBuilding: true,
    messages: [{ role: "assistant" as const, content: "Planning", timestamp: 1 }],
    buildFiles: [
      { path: "src/App.tsx", purpose: "Root app shell", status: "completed" as const },
      { path: "src/components/Hero.tsx", purpose: "Hero section", status: "generating" as const },
    ],
    workingCode: "// FILE: src/App.tsx\nexport default function App() { return null; }\n\n// FILE: src/components/Hero.tsx\nexport function Hero() { return null; }",
  });

  it("lists each planned file once with its status and expands to show content", () => {
    const { container } = render(<PromptPanel {...activityProps()} />);
    const active = screen.getByRole("button", { name: /src\/components\/Hero\.tsx/ });
    const done = screen.getByRole("button", { name: /src\/App\.tsx/ });
    expect(active).toHaveAttribute("aria-expanded", "true");
    expect(done).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(1);
    expect(container.textContent).toContain("1/2 files");

    fireEvent.click(screen.getByRole("button", { name: /src\/App\.tsx/ }));
    expect(screen.getByText(/export default function App/)).toBeInTheDocument();
  });

  it("updates the existing activity entry instead of duplicating it", () => {
    const { rerender } = render(<PromptPanel {...activityProps()} />);
    rerender(<PromptPanel {...activityProps()} buildFiles={[
      { path: "src/App.tsx", purpose: "Root app shell", status: "completed" as const },
      { path: "src/components/Hero.tsx", purpose: "Hero section", status: "completed" as const },
    ]} />);
    expect(screen.getByRole("button", { name: /src\/App\.tsx/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /src\/components\/Hero\.tsx/ })).toBeInTheDocument();
    expect(screen.getAllByText("src/components/Hero.tsx")).toHaveLength(1);
  });
});

describe("PromptPanel prompt focus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: MockSpeechRecognition });
  });

  it("keeps the prompt editable while a build is running", () => {
    render(<PromptPanel {...props()} isBuilding prompt="Build an app" />);
    expect(screen.getByLabelText("Describe the app to build")).not.toBeDisabled();
  });

  it("returns the caret to the prompt after sending", async () => {
    const onBuild = vi.fn();
    render(<PromptPanel {...props()} prompt="Build an app" onBuild={onBuild} />);
    const textarea = screen.getByLabelText("Describe the app to build");
    fireEvent.click(screen.getByRole("button", { name: /^Build$/ }));
    expect(onBuild).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(textarea).toHaveFocus());
  });
});

const activityMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  role: "assistant",
  kind: "activity",
  content: "Built your project",
  title: "Built your project",
  timestamp: 500,
  activity: {
    id: "a1",
    status: "success",
    title: "Built your project",
    stage: "Validation passed",
    files: [{ path: "src/App.tsx", purpose: "Root app", status: "completed" }],
    timeline: ["Planning", "Generating src/App.tsx", "Completed src/App.tsx"],
    startedAt: 1000,
    endedAt: 4000,
    versionId: "v1",
    validation: ["Validation passed for 1 source file"],
    errors: [],
  },
  ...overrides,
});

describe("activity details and preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: MockSpeechRecognition });
  });

  it("expands details and requests the activity preview", () => {
    const onPreviewActivity = vi.fn();
    render(<PromptPanel {...props()} messages={[activityMessage()]} hasCode onPreviewActivity={onPreviewActivity} />);
    expect(screen.getByRole("heading", { name: "Built your project" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByText(/Validation passed for 1 source file/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(onPreviewActivity).toHaveBeenCalledTimes(1);
  });

  it("shows file content from the stored version snapshot", () => {
    render(
      <PromptPanel
        {...props()}
        messages={[activityMessage()]}
        hasCode
        resolveActivityCode={(versionId) => versionId === "v1" ? "// FILE: src/App.tsx\nexport default function App() { return null; }" : null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Show details for src\/App\.tsx/ }));
    expect(screen.getByText(/export default function App/)).toBeInTheDocument();
  });

  it("reports failure and cancellation states truthfully", () => {
    const { rerender } = render(<PromptPanel {...props()} messages={[activityMessage({ activity: { ...activityMessage().activity!, status: "error", errors: ["Provider returned invalid JSON"], endedAt: 4000 } })]} hasCode />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByText(/Provider returned invalid JSON/)).toBeInTheDocument();
    rerender(<PromptPanel {...props()} messages={[activityMessage({ activity: { ...activityMessage().activity!, status: "stopped", endedAt: 4000 } })]} hasCode />);
    expect(screen.getByText("Stopped")).toBeInTheDocument();
  });
});

describe("message actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: MockSpeechRecognition });
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it("records feedback, bookmarks and copies messages", async () => {
    const onMessageFeedback = vi.fn();
    const onToggleBookmark = vi.fn();
    render(
      <PromptPanel
        {...props()}
        hasCode
        messages={[{ role: "assistant", content: "Done", timestamp: 42 }]}
        onMessageFeedback={onMessageFeedback}
        onToggleBookmark={onToggleBookmark}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Helpful" }));
    expect(onMessageFeedback).toHaveBeenCalledWith(42, "up");
    fireEvent.click(screen.getByRole("button", { name: "Not helpful" }));
    expect(onMessageFeedback).toHaveBeenCalledWith(42, "down");
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Done");
    const more = screen.getByRole("button", { name: "More options" });
    fireEvent.keyDown(more, { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: /Bookmark message/ }));
    expect(onToggleBookmark).toHaveBeenCalledWith(42);
  });
});
