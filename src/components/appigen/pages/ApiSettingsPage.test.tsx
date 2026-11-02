import { describe, expect, it } from "vitest";
import { healthStatusLabel } from "./ApiSettingsPage";

describe("provider health labels", () => {
  it.each([
    ["working", "Working"],
    ["invalid_key", "Invalid key"],
    ["quota_exhausted", "Quota exhausted"],
    ["rate_limited", "Rate limited"],
    ["model_unavailable", "Model unavailable"],
    ["network_error", "Network error"],
  ])("labels %s", (status, label) => {
    expect(healthStatusLabel(status)).toBe(label);
  });
});
