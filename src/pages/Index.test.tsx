import { describe, expect, it } from "vitest";
import { createInitialStudioState, getValidationSummary, removePromptConversationBlocks, requiresClarification, resolveProjectTitle, resolveSplitDrop, shouldAutoHideSidebar } from "./Index";

describe("Index startup state", () => {
  it("starts every fresh Studio session as a clean Untitled Project", () => {
    expect(createInitialStudioState()).toEqual({
      prompt: "",
      title: "Untitled Project",
      code: null,
      projectId: null,
      messages: [],
      versions: [],
      mobileTab: "chat",
    });
  });
});

describe("Index review status messaging", () => {
  it("explains that AI review was skipped while local validation passed", () => {
    const message = getValidationSummary(true, 2);

    expect(message).toContain("AI review was skipped to save tokens");
    expect(message).toContain("local project validation passed");
    expect(message).not.toContain("Review complete");
  });

  it("keeps the completed-review message for first builds", () => {
    expect(getValidationSummary(false, 1)).toContain("Review complete");
  });

  it("removes complete conversation blocks for the selected prompt", () => {
    const messages = [
      { role: "user" as const, content: "Build the first app", timestamp: 1 },
      { role: "assistant" as const, content: "First app ready", timestamp: 2 },
      { role: "user" as const, content: "Add a chart", timestamp: 3 },
      { role: "assistant" as const, content: "Chart added", timestamp: 4 },
      { role: "user" as const, content: "Add a chart", timestamp: 5 },
    ];

    expect(removePromptConversationBlocks(messages, "Add a chart")).toEqual([
      messages[0],
      messages[1],
    ]);
  });
});

describe("AI project title", () => {
  it("uses the AI plan title for new projects and keeps manual names for edits", () => {
    expect(resolveProjectTitle({ editMode: false, planTitle: "Expense Tracker", fallback: "Fallback Title", currentTitle: "Untitled Project" })).toBe("Expense Tracker");
    expect(resolveProjectTitle({ editMode: false, fallback: "Fallback Title", currentTitle: "Untitled Project" })).toBe("Fallback Title");
    expect(resolveProjectTitle({ editMode: true, planTitle: "Ignored", fallback: "Fallback Title", currentTitle: "My Renamed App" })).toBe("My Renamed App");
    expect(resolveProjectTitle({ editMode: true, fallback: "Fallback Title", currentTitle: "Untitled Project" })).toBe("Fallback Title");
  });
});

describe("studio split divider", () => {
  it("keeps a draggable divider between chat and preview panels", async () => {
    const { render, screen } = await import("@testing-library/react");
    const { ResizableHandle, ResizablePanel, ResizablePanelGroup } = await import("@/components/ui/resizable");
    render(
      <ResizablePanelGroup direction="horizontal" autoSaveId="appigen-studio-split">
        <ResizablePanel defaultSize={30} minSize={22} maxSize={40}><div>Chat</div></ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={70} minSize={50}><div>Preview</div></ResizablePanel>
      </ResizablePanelGroup>,
    );
    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });
});

describe("divider full-panel control", () => {
  it("collapses the preview when the divider is dragged to the far right", () => {
    expect(resolveSplitDrop([98, 2], [30, 70], 30)).toEqual([100, 0]);
  });

  it("collapses the chat when the divider is dragged to the far left", () => {
    expect(resolveSplitDrop([2, 98], [30, 70], 30)).toEqual([0, 100]);
  });

  it("keeps a normal drag position and clamps it to safe bounds", () => {
    expect(resolveSplitDrop([40, 60], [30, 70], 30)).toEqual([40, 60]);
    expect(resolveSplitDrop([60, 40], [30, 70], 30)).toEqual([45, 55]);
  });

  it("restores the last proportion when expanding a collapsed panel", () => {
    expect(resolveSplitDrop([80, 20], [0, 100], 38)).toEqual([38, 62]);
    expect(resolveSplitDrop([20, 80], [100, 0], 24)).toEqual([24, 76]);
  });
});

describe("sidebar auto-hide rules", () => {
  it("keeps the sidebar visible during conversation, questions and planning", () => {
    expect(shouldAutoHideSidebar(false, false)).toBe(false);
    expect(shouldAutoHideSidebar(false, true)).toBe(false);
  });

  it("collapses the sidebar only when a real build or edit starts", () => {
    expect(shouldAutoHideSidebar(true, false)).toBe(true);
    expect(shouldAutoHideSidebar(true, true)).toBe(false);
  });
});

describe("vague prompt gating", () => {
  it("asks for detail before building a brand new app from a placeholder prompt", () => {
    expect(requiresClarification("bnao isko", false)).toBe(true);
    expect(requiresClarification("design karo", false)).toBe(true);
  });

  it("lets concrete new-app prompts and edits proceed", () => {
    expect(requiresClarification("Mere liye ek expense tracker banao", false)).toBe(false);
    expect(requiresClarification("Isko professional banao", true)).toBe(false);
  });
});
