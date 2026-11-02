import { describe, expect, it } from "vitest";
import { isNewAppPrompt } from "./promptIntent";

describe("prompt intent", () => {
  it.each([
    "start a new app",
    "create a brand-new project",
    "start from scratch",
    "create a separate website",
  ])("starts a fresh project only for explicit intent: %s", (prompt) => {
    expect(isNewAppPrompt(prompt)).toBe(true);
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
