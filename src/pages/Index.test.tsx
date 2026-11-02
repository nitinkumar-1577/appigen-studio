import { describe, expect, it } from "vitest";
import { getValidationSummary } from "./Index";

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
});
