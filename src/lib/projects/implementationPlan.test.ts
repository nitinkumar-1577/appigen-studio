import { describe, expect, it } from "vitest";
import { createImplementationPlan, formatImplementationPlan } from "./implementationPlan";

describe("implementation roadmap", () => {
  it.each([
    ["Ludo against the computer", "src/lib/ludo-rules.ts"],
    ["Chess against a computer opponent", "src/lib/chess-rules.ts"],
    ["A racing game", "src/lib/racing-rules.ts"],
    ["A platformer game", "src/lib/platformer-rules.ts"],
    ["A tower defense game", "src/lib/tower-defense-rules.ts"],
    ["A space shooter game", "src/lib/space-shooter-rules.ts"],
  ])("plans focused game modules for %s", (prompt, rulesPath) => {
    const { architecture, implementationPlan } = createImplementationPlan({
      prompt,
      appType: "game",
      domain: "casual gaming",
      complexity: "complex",
    });

    expect(architecture.hooks).toHaveLength(1);
    expect(architecture.utils[0]?.path).toBe(rulesPath);
    expect(implementationPlan.fileBlueprint.map((file) => file.path)).toContain(rulesPath);
    expect(implementationPlan.steps[0]).toContain("user flows");
    expect(implementationPlan.designDirection.join(" ")).toContain("complete recognizable");
    expect(implementationPlan.qualityChecks.join(" ")).toContain("legal actions");
    expect(implementationPlan.fileBlueprint.map((file) => file.path)).toContain("src/styles.css");
    expect(implementationPlan.requirements).toContain(prompt);
  });

  it("includes existing files and preservation steps for an edit plan", () => {
    const { implementationPlan } = createImplementationPlan({
      prompt: "Add dark mode",
      appType: "website",
      domain: "website",
      complexity: "moderate",
      existingFiles: ["src/App.tsx", "src/styles.css"],
      hasExistingProject: true,
    });

    expect(implementationPlan.existingFiles).toEqual(["src/App.tsx", "src/styles.css"]);
    expect(implementationPlan.steps).toContain("Preserve unrelated behavior and project structure");
    expect(formatImplementationPlan(implementationPlan)).toContain("Planned files:");
    expect(formatImplementationPlan(implementationPlan)).toContain("Design plan:");
    expect(formatImplementationPlan(implementationPlan)).toContain("Review and validation checklist:");
    expect(formatImplementationPlan(implementationPlan)).toContain("Existing project files to inspect");
    expect(formatImplementationPlan(implementationPlan)).toContain("Add dark mode");
  });
});
