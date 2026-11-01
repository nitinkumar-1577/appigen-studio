import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_GENERATION_SETTINGS,
  DEFAULT_PREFERENCES,
  readAppPreferences,
  readGenerationSettings,
  saveAppPreferences,
  saveGenerationSettings,
  applyAppPreferences,
} from "./appPreferences";

describe("AppiGen preferences", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to a dark theme and the configured default generation model", () => {
    expect(readAppPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(readGenerationSettings()).toEqual(DEFAULT_GENERATION_SETTINGS);
  });

  it("persists appearance and model preferences across reloads", () => {
    saveAppPreferences({ ...DEFAULT_PREFERENCES, theme: "system", density: "Compact", autoDraft: false, provider: "deepseek", model: "openai/gpt-oss-20b" });
    saveGenerationSettings({ ...DEFAULT_GENERATION_SETTINGS, provider: "deepseek", model: "openai/gpt-oss-20b" });

    expect(readAppPreferences()).toMatchObject({ theme: "system", density: "Compact", autoDraft: false, provider: "deepseek", model: "openai/gpt-oss-20b" });
    expect(readGenerationSettings()).toMatchObject({ provider: "deepseek", model: "openai/gpt-oss-20b" });
    expect(localStorage.getItem("appigen.preferences.v1")).not.toContain("API_KEY");
    expect(localStorage.getItem("appigen.generation-settings.v1")).not.toContain("API_KEY");
  });

  it("migrates missing or invalid providers to Groq", () => {
    localStorage.setItem("appigen.preferences.v1", JSON.stringify({ model: "openai/gpt-oss-20b" }));
    localStorage.setItem("appigen.generation-settings.v1", JSON.stringify({ model: "openai/gpt-oss-20b" }));

    expect(readAppPreferences().provider).toBe("groq");
    expect(readGenerationSettings().provider).toBe("groq");

    localStorage.setItem("appigen.preferences.v1", JSON.stringify({ provider: "invalid" }));
    localStorage.setItem("appigen.generation-settings.v1", JSON.stringify({ provider: "invalid" }));
    expect(readAppPreferences().provider).toBe("groq");
    expect(readGenerationSettings().provider).toBe("groq");
  });

  it("applies system theme as dark while applying the selected density", () => {
    applyAppPreferences({ ...DEFAULT_PREFERENCES, theme: "system", density: "Spacious" });

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.density).toBe("spacious");
  });
});
