import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PromptPanel, speechRecognitionErrorMessage } from "./PromptPanel";

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
