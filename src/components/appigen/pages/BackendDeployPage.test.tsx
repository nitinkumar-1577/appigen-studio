import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BackendDeployPage } from "./BackendDeployPage";

vi.mock("../AppContext", () => ({ useApp: () => ({ user: null, session: null }) }));
vi.mock("@/lib/backend/generatedAppBackendStorage", () => ({
  readGeneratedBackendState: () => null,
  writeGeneratedBackendState: () => {},
  defaultGeneratedBackendState: (k: string) => ({
    generatedAppId: `app-${k}`,
    mode: "shared",
    config: { generatedAppId: `app-${k}`, ownerId: "local", mode: "shared", provisioningStatus: "not_configured", config: {} },
    envVars: [],
    updatedAt: 0,
  }),
}));
vi.mock("@/lib/backend/backendManager", async (orig) => {
  const actual = await orig<typeof import("@/lib/backend/backendManager")>();
  return actual;
});

describe("BackendDeployPage", () => {
  it("renders unified backend mode selection and deployment section", () => {
    render(<BackendDeployPage projectId={null} projectTitle="Untitled" />);
    expect(screen.getByRole("heading", { name: /Backend & Deploy/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Shared Supabase/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dedicated Supabase/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Deployment integration/i })).toBeInTheDocument();
    expect(screen.getByText(/Per-app environment variables & secrets/i)).toBeInTheDocument();
  });
});
