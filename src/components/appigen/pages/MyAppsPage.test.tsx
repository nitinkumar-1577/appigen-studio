import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MyAppsPage } from "./MyAppsPage";

const mocks = vi.hoisted(() => ({
  loadProjects: vi.fn(),
  renameProject: vi.fn(),
  softDeleteProject: vi.fn(),
  subscribeToProjectSync: vi.fn(() => () => {}),
  state: {
    user: { name: "User A", email: "a@example.com" },
    session: { user: { id: "user-a" } },
  },
}));

vi.mock("../AppContext", () => ({
  useApp: () => mocks.state,
}));

vi.mock("@/lib/projects/projectRepository", () => ({
  loadProjects: mocks.loadProjects,
  renameProject: mocks.renameProject,
  softDeleteProject: mocks.softDeleteProject,
  subscribeToProjectSync: mocks.subscribeToProjectSync,
}));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const projectFor = (userId: string, title: string) => ({
  id: `${userId}-project`,
  user_id: userId,
  title,
  prompt: `Build ${title}`,
  code: "export default function App() { return null; }",
  thumbnail: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  deleted_at: null,
});

describe("MyAppsPage account visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.user = { name: "User A", email: "a@example.com" };
    mocks.state.session = { user: { id: "user-a" } };
    mocks.loadProjects.mockImplementation(async (userId: string) => [
      projectFor(userId, userId === "user-a" ? "User A app" : "User B app"),
    ]);
    mocks.renameProject.mockResolvedValue(undefined);
  });

  it("loads only the active account's projects after an account switch", async () => {
    const { rerender } = render(<MyAppsPage onNavigate={vi.fn()} onOpenSignIn={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("User A app")).toBeInTheDocument());
    expect(mocks.loadProjects).toHaveBeenCalledWith("user-a");
    expect(screen.queryByText("User B app")).not.toBeInTheDocument();

    mocks.state.user = { name: "User B", email: "b@example.com" };
    mocks.state.session = { user: { id: "user-b" } };
    rerender(<MyAppsPage onNavigate={vi.fn()} onOpenSignIn={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("User B app")).toBeInTheDocument());
    expect(mocks.loadProjects).toHaveBeenLastCalledWith("user-b");
    expect(screen.queryByText("User A app")).not.toBeInTheDocument();
  });

  it("shows the original empty state for a signed-in account with no projects", async () => {
    mocks.loadProjects.mockResolvedValue([]);

    render(<MyAppsPage onNavigate={vi.fn()} onOpenSignIn={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("No projects yet")).toBeInTheDocument());
    expect(screen.getByText("Build")).toBeInTheDocument();
    expect(screen.getByText(/in the studio to generate your first app/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start a project" })).toBeInTheDocument();
  });

  it("renames a saved project from My Apps", async () => {
    render(<MyAppsPage onNavigate={vi.fn()} onOpenSignIn={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("User A app")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Rename User A app" }));
    const input = await screen.findByRole("textbox", { name: "Project name" });
    fireEvent.change(input, { target: { value: "Renamed app" } });
    fireEvent.click(screen.getByRole("button", { name: "Save project name" }));

    await waitFor(() => expect(mocks.renameProject).toHaveBeenCalledWith("user-a-project", "user-a", "Renamed app"));
  });
});
