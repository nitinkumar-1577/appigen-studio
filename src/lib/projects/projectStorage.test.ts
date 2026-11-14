import { afterEach, describe, expect, it } from "vitest";
import {
  clearLocalVersions,
  clearProjectChangeRecords,
  clearProjectMemory,
  deleteLocalVersion,
  discardProjectDraft,
  readLocalVersionsForProject,
  readProjectChangeRecords,
  readProjectDraft,
  readProjectMemory,
  writeLocalVersion,
  writeProjectChangeRecord,
  writeProjectDraft,
  writeProjectMemory,
} from "./projectStorage";

describe("project draft persistence", () => {
  afterEach(() => localStorage.clear());

  it("restores the saved project id and generated code", () => {
    writeProjectDraft({
      projectId: "project-123",
      ownerId: "user-123",
      title: "Tasks",
      prompt: "Add filters",
      code: "export default function App() {}",
      messages: [],
      versions: [],
      updatedAt: 42,
    });

    expect(readProjectDraft()?.projectId).toBe("project-123");
    expect(readProjectDraft()?.ownerId).toBe("user-123");
    expect(readProjectDraft()?.code).toBe("export default function App() {}");
  });

  it("removes a draft when the owner discards it", () => {
    writeProjectDraft({
      projectId: null,
      title: "Untitled Project",
      prompt: "A draft",
      code: null,
      messages: [],
      versions: [],
      updatedAt: 42,
    });
    discardProjectDraft();
    expect(readProjectDraft()).toBeNull();
  });

  it("restores and clears local version history by project", () => {
    const version = {
      id: "version-123",
      code: "export default function App() { return null; }",
      prompt: "Add a header",
      createdAt: 43,
    };
    writeLocalVersion("local:current", version);

    expect(readLocalVersionsForProject("local:current")).toEqual([version]);
    clearLocalVersions("local:current");
    expect(readLocalVersionsForProject("local:current")).toEqual([]);
  });

  it("deletes only the selected local version", () => {
    const first = { id: "version-1", code: "one", prompt: "First", createdAt: 1 };
    const second = { id: "version-2", code: "two", prompt: "Second", createdAt: 2 };
    writeLocalVersion("local:current", first);
    writeLocalVersion("local:current", second);

    deleteLocalVersion("local:current", first.id);

    expect(readLocalVersionsForProject("local:current")).toEqual([second]);
  });
});
  it("stores and isolates project memory and change records by project key", () => {
    writeProjectMemory("p1", { projectId: "p1", projectKey: "p1", title: "A", architectureSummary: "a", keyModules: [], decisions: [], requirements: ["req"], changeHistory: [], conflicts: [], clarifications: [], updatedAt: 1 });
    writeProjectMemory("p2", { projectId: "p2", projectKey: "p2", title: "B", architectureSummary: "b", keyModules: [], decisions: [], requirements: ["other"], changeHistory: [], conflicts: [], clarifications: [], updatedAt: 2 });
    expect(readProjectMemory("p1")?.requirements).toEqual(["req"]);
    expect(readProjectMemory("p2")?.requirements).toEqual(["other"]);
    writeProjectChangeRecord("p1", { id: "c1", projectKey: "p1", prompt: "x", reason: "edit", at: 1, changedPaths: ["src/App.tsx"], addedPaths: [], removedPaths: [], unchangedCount: 0, files: [], summary: "Changes: modified 1" });
    expect(readProjectChangeRecords("p1")[0]?.id).toBe("c1");
    expect(readProjectChangeRecords("p2")).toEqual([]);
    clearProjectMemory("p1");
    clearProjectChangeRecords("p1");
    expect(readProjectMemory("p1")).toBeNull();
    expect(readProjectChangeRecords("p1")).toEqual([]);
  });
