import { describe, expect, it } from "vitest";
import { detectConflicts, deriveRequirements, emptyProjectMemory, formatMemoryForPrompt, updateProjectMemory } from "./projectMemory";

describe("project memory", () => {
  it("derives project-scoped requirements from user messages", () => {
    const reqs = deriveRequirements([
      { role: "user", content: "Build a notes app with folders", timestamp: 1 },
      { role: "assistant", content: "ok", timestamp: 2 },
      { role: "user", content: "Add dark mode and remember preference", timestamp: 3 },
    ]);
    expect(reqs).toEqual(["Build a notes app with folders", "Add dark mode and remember preference"]);
  });

  it("detects conflicts and clarification needs for risky follow-ups", () => {
    const memory = updateProjectMemory({
      existing: { ...emptyProjectMemory("proj-a", "proj-a"), changeHistory: [{ at: 1, prompt: "Add login", summary: "added auth", changed: ["src/App.tsx"] }], decisions: [] },
      projectKey: "proj-a",
      projectId: "proj-a",
      understanding: null,
      messages: [{ role: "user", content: "Add login", timestamp: 1 }],
      prompt: "remove authentication",
      changedFiles: ["src/App.tsx"],
      changeSummary: "added auth",
    });
    expect(memory.conflicts.join(" ")).toMatch(/authentication/i);
    const revert = detectConflicts("revert the previous change", emptyProjectMemory("proj-b", "proj-b"));
    expect(revert.clarifications.length).toBeGreaterThan(0);
  });

  it("keeps memory scoped to its project key and formats prompt context", () => {
    const existing = emptyProjectMemory("proj-a", "proj-a");
    existing.requirements = ["Keep sidebar"];
    const updated = updateProjectMemory({
      existing,
      projectKey: "proj-b",
      projectId: "proj-b",
      understanding: { projectId: "proj-b", fileCount: 1, files: [], entryPoints: ["src/App.tsx"], keyModules: ["src/App.tsx"], dependencyGraph: {}, reverseDependencyGraph: {}, areas: { frontend:["src/App.tsx"], state:[], domain:[], styling:[], routing:[], data:[], api:[], backend:[], auth:[], config:[], test:[], other:[] }, routes: [], components: [], hooks: [], contexts: [], utils: [], styles: [], apis: [], dataFiles: [], architectureSummary: "1 files" },
      messages: [{ role: "user", content: "Add search", timestamp: 1 }],
      prompt: "Add search",
    });
    expect(updated.projectKey).toBe("proj-b");
    expect(updated.requirements).toEqual(["Add search"]);
    expect(updated.requirements).not.toContain("Keep sidebar");
    const text = formatMemoryForPrompt(updated, null);
    expect(text).toContain("project-scoped");
    expect(text).toContain("Add search");
  });
});
