import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadMostRecentProject, loadProjects, loadProject, persistProject } from "./projectRepository";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from },
}));

const project = {
  id: "project-a",
  user_id: "user-a",
  title: "Private app",
  prompt: "Build a private app",
  code: "export default function App() { return null; }",
  files: {},
  messages: [],
  thumbnail: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

const createQuery = (result: { data?: unknown; error: unknown }) => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    upsert: vi.fn(),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.upsert.mockReturnValue(query);
  query.single.mockResolvedValue(result);
  query.maybeSingle.mockResolvedValue(result);
  return query;
};

describe("project repository account ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("only requests project summaries for the active account", async () => {
    const query = createQuery({ data: [project], error: null });
    mocks.from.mockReturnValue(query);

    const projects = await loadProjects("user-a");

    expect(projects).toEqual([project]);
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(projects.some((entry) => entry.user_id !== "user-a")).toBe(false);
  });

  it("loads the latest project through the active account scope", async () => {
    const summaryQuery = createQuery({ data: project, error: null });
    const detailQuery = createQuery({ data: project, error: null });
    mocks.from.mockReturnValueOnce(summaryQuery).mockReturnValueOnce(detailQuery);

    const loaded = await loadMostRecentProject("user-a");

    expect(loaded?.id).toBe("project-a");
    expect(summaryQuery.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(detailQuery.eq).toHaveBeenCalledWith("user_id", "user-a");
  });

  it("restores the complete stored file map when marker code is unavailable", async () => {
    const stored = {
      ...project,
      code: "export default function App() { return null; }",
      files: {
        "src/App.tsx": "export default function App() { return <Layout />; }",
        "src/components/Layout.tsx": "export default function Layout() { return null; }",
      },
    };
    const query = createQuery({ data: stored, error: null });
    mocks.from.mockReturnValue(query);

    const loaded = await loadProject("project-a", "user-a");

    expect(loaded.files["src/components/Layout.tsx"]).toContain("Layout");
    expect(loaded.code).toContain("// FILE: src/components/Layout.tsx");
  });

  it("rejects opening a project outside the active account scope", async () => {
    const query = createQuery({ data: null, error: new Error("Project not found") });
    mocks.from.mockReturnValue(query);

    await expect(loadProject("project-b", "user-a")).rejects.toThrow("Project not found");
    expect(query.eq).toHaveBeenCalledWith("id", "project-b");
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-a");
  });

  it("persists new projects with the active account owner", async () => {
    const query = createQuery({ data: { id: "project-new" }, error: null });
    mocks.from.mockReturnValue(query);

    const id = await persistProject({
      projectId: null,
      userId: "user-a",
      title: "New app",
      prompt: "Build an app",
      code: "export default function App() { return null; }",
      messages: [],
    });

    expect(id).toBe("project-new");
    expect(query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-a", title: "New app" }),
      { onConflict: "id" },
    );
  });
});
