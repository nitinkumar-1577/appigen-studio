import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "./AppContext";

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: authMocks },
}));

const SessionState = () => {
  const { authReady, user, recoveryPending } = useApp();
  return <div>{authReady ? `ready:${user?.email ?? "signed-out"}:${recoveryPending}` : "loading"}</div>;
};

describe("AppContext session bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  it("restores the existing Supabase session", async () => {
    authMocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "user-a", email: "a@example.com", user_metadata: {} } } },
      error: null,
    });
    render(<AppProvider><SessionState /></AppProvider>);

    await waitFor(() => expect(screen.getByText("ready:a@example.com:false")).toBeInTheDocument());
  });

  it("keeps a newer auth event when the initial session request resolves later", async () => {
    let resolveSession: ((value: { data: { session: null }; error: null }) => void) | undefined;
    authMocks.getSession.mockImplementation(() => new Promise((resolve) => { resolveSession = resolve; }));
    let onAuthEvent: ((event: string, session: unknown) => void) | undefined;
    authMocks.onAuthStateChange.mockImplementation((callback) => {
      onAuthEvent = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    render(<AppProvider><SessionState /></AppProvider>);

    act(() => onAuthEvent?.("SIGNED_IN", { user: { id: "new-user", email: "new@example.com", user_metadata: {} } }));
    await waitFor(() => expect(screen.getByText("ready:new@example.com:false")).toBeInTheDocument());
    await act(async () => { resolveSession?.({ data: { session: null }, error: null }); });

    expect(screen.getByText("ready:new@example.com:false")).toBeInTheDocument();
  });

  it("settles auth readiness if session restoration rejects", async () => {
    authMocks.getSession.mockRejectedValue(new Error("network unavailable"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AppProvider><SessionState /></AppProvider>);

    await waitFor(() => expect(screen.getByText("ready:signed-out:false")).toBeInTheDocument());
    error.mockRestore();
  });
});
