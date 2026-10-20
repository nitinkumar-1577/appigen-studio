import { describe, expect, it } from "vitest";
import { isNewAppPrompt } from "./promptIntent";

describe("prompt intent", () => {
  it.each([
    "Build a snake game",
    "Create a budgeting app",
    "Make me a portfolio website",
    "Design another app for tracking workouts",
  ])("starts a fresh project for app request: %s", (prompt) => {
    expect(isNewAppPrompt(prompt)).toBe(true);
  });

  it.each([
    "Add keyboard shortcuts",
    "Change the background color",
    "Make this app use a blue theme",
    "Build a settings page in this project",
    "Please update the existing website header",
  ])("keeps an in-project request in edit mode: %s", (prompt) => {
    expect(isNewAppPrompt(prompt)).toBe(false);
  });
});
