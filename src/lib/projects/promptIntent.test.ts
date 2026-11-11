import { describe, expect, it } from "vitest";
import { analyzeIntent, isNewAppPrompt, isProjectConversation, isProjectQuestion } from "./promptIntent";

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

  it("integrates multilingual conversational intelligence", () => {
    expect(analyzeIntent("Mujhe batao authentication kya hota hai?", { hasExistingProject: false }).shouldBuild).toBe(false);
    expect(analyzeIntent("Mujhe ek calculator banana hai, kaise banega?", { hasExistingProject: false }).shouldBuild).toBe(false);
    expect(analyzeIntent("Achha, ab ye app bana do.", { hasExistingProject: false }).shouldBuild).toBe(true);
    expect(analyzeIntent("Ab monthly reports bhi add kar do.", { hasExistingProject: true }).shouldBuild).toBe(true);
    expect(analyzeIntent("Isme kya galat hai?", { hasExistingProject: true }).shouldBuild).toBe(false);
    expect(analyzeIntent("Isme login add kr do.", { hasExistingProject: true }).shouldBuild).toBe(true);
  });
});
