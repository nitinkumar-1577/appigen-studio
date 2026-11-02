import { describe, expect, it } from "vitest";
import { getValidationSummary, removeLatestMatchingUserMessage } from "./Index";

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

  it("removes only the selected version prompt and keeps other chat messages", () => {
    const messages = [
      { role: "user" as const, content: "Build the first app", timestamp: 1 },
      { role: "assistant" as const, content: "First app ready", timestamp: 2 },
      { role: "user" as const, content: "Add a chart", timestamp: 3 },
      { role: "assistant" as const, content: "Chart added", timestamp: 4 },
    ];

    expect(removeLatestMatchingUserMessage(messages, "Add a chart")).toEqual([
      messages[0],
      messages[1],
      messages[3],
    ]);
  });
});
