import { describe, expect, it } from "vitest";
import { createInitialStudioState, getValidationSummary, removePromptConversationBlocks } from "./Index";

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
