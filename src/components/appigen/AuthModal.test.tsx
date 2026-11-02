import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthModal } from "./AuthModal";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
  updateUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signUp: mocks.signUp,
      signInWithOAuth: mocks.signInWithOAuth,
      updateUser: mocks.updateUser,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
    },
  },
}));

vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));

const openSignUp = () => {
  render(<AuthModal open onClose={vi.fn()} />);
  fireEvent.click(screen.getByText("Create account"));
};

const fillSignUp = (email = "person@example.com", password = "Strongpass1") => {
  fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Ada Lovelace" } });
  fireEvent.change(screen.getByPlaceholderText("you@company.com"), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: password } });
  fireEvent.change(screen.getByPlaceholderText("Confirm password"), { target: { value: password } });
};

const submitSignUp = () => {
  const buttons = screen.getAllByRole("button", { name: "Create account" });
  fireEvent.click(buttons[buttons.length - 1]);
};

describe("AuthModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signUp.mockResolvedValue({
      data: {
        user: { identities: [{}], email_confirmed_at: null },
        session: null,
      },
      error: null,
    });
    mocks.signInWithOAuth.mockResolvedValue({ error: null });
    mocks.updateUser.mockResolvedValue({ error: null });
  });

  it("accepts valid email formats and rejects invalid ones", async () => {
    openSignUp();
    fillSignUp("not-an-email");
    submitSignUp();
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Enter a valid email address" }));

    fillSignUp("person@example.com");
    submitSignUp();
    await waitFor(() => expect(mocks.signUp).toHaveBeenCalled());
  });

  it("requires a strong password and matching confirmation", () => {
    openSignUp();
    fillSignUp("person@example.com", "weak");
    submitSignUp();
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Password is too short" }));

    fillSignUp("person@example.com", "password");
    submitSignUp();
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Use a stronger password" }));

    fillSignUp("person@example.com", "Strongpass1");
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), { target: { value: "Different1" } });
    submitSignUp();
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Passwords do not match" }));
  });

  it("handles an existing account without signing it in", () => {
    mocks.signUp.mockResolvedValueOnce({
      data: { user: { identities: [] }, session: null },
      error: null,
    });
    openSignUp();
    fillSignUp();
    submitSignUp();
    return waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Account already exists" })));
  });

  it("shows the email verification notice when no confirmed session exists", async () => {
    openSignUp();
    fillSignUp();
    submitSignUp();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("confirm your address"));
  });

  it("opens the reset form when recovery is received", () => {
    const onRecoveryHandled = vi.fn();
    const { rerender } = render(<AuthModal open={false} recoveryPending onRecoveryHandled={onRecoveryHandled} onClose={vi.fn()} />);
    rerender(<AuthModal open recoveryPending onRecoveryHandled={onRecoveryHandled} onClose={vi.fn()} />);
    expect(screen.getByText("Set a new password")).toBeInTheDocument();
    expect(onRecoveryHandled).toHaveBeenCalled();
  });

  it("updates the password successfully", async () => {
    render(<AuthModal open recoveryPending onRecoveryHandled={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "Newstrong1" } });
    fireEvent.change(screen.getByPlaceholderText("Confirm password"), { target: { value: "Newstrong1" } });
    fireEvent.click(screen.getByText("Update password"));
    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledWith({ password: "Newstrong1" }));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Password updated" }));
  });

  it("requests account selection for Google without changing GitHub OAuth", async () => {
    const { unmount } = render(<AuthModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Continue with Google"));
    await waitFor(() => expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: expect.any(String),
        queryParams: { prompt: "select_account" },
      },
    }));

    unmount();
    render(<AuthModal open onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Continue with GitHub"));
    await waitFor(() => expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "github",
      options: { redirectTo: expect.any(String) },
    }));
  });
});
