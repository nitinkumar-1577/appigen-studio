import { describe, expect, it } from "vitest";
import { isNewAppPrompt, isProjectConversation, isProjectQuestion } from "./promptIntent";

describe("prompt intent", () => {
  it.each([
    "start a new app",
    "create a brand-new project",
    "start from scratch",
    "create a separate website",
  ])("starts a fresh project only for explicit intent: %s", (prompt) => {
    expect(isNewAppPrompt(prompt)).toBe(true);
  });

  describe("project conversation intent", () => {
    it("recognizes questions only when a project exists", () => {
      expect(isProjectQuestion("Why does the dashboard use this chart?", true)).toBe(true);
      expect(isProjectQuestion("Why does the dashboard use this chart?", false)).toBe(false);
    });

    it("does not classify change requests as questions", () => {
      expect(isProjectQuestion("Update the dashboard chart", true)).toBe(false);
    });

    it("keeps normal conversation out of the build path", () => {
      expect(isProjectConversation("Hello, what can you help me with?", false)).toBe(true);
      expect(isProjectConversation("Thanks, that looks good.", true)).toBe(true);
      expect(isProjectConversation("Build a task manager", false)).toBe(false);
    });
  });

  it.each([
    "Create an admin page",
    "Build a settings page",
    "Make the layout responsive",
    "Add authentication",
    "Create a new dashboard page",
    "Add keyboard shortcuts",
    "Change the background color",
    "Make this app use a blue theme",
    "Build a settings page in this project",
    "Please update the existing website header",
  ])("keeps an in-project request in edit mode: %s", (prompt) => {
    expect(isNewAppPrompt(prompt)).toBe(false);
  });
});
