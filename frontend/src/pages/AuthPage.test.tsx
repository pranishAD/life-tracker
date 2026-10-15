import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import AuthPage from "./AuthPage";
import { AuthProvider } from "../context/AuthContext";
import { ApiError } from "../api/client";
import * as authApi from "../api/auth";

function renderAuthPage(path = "/login") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage />} />
          <Route path="/dashboard" element={<div>Dashboard home</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("AuthPage (login form)", () => {
  // A successful-login test stores a real token in localStorage; clear it
  // (and any mocks) so the next test's <AuthProvider> doesn't try to
  // validate a stale token against the real backend on mount.
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("shows the backend's error message when login fails, and does not navigate away", async () => {
    vi.spyOn(authApi, "login").mockRejectedValue(new ApiError(401, "UNAUTHORIZED", "Email or password is incorrect."));
    const user = userEvent.setup();
    renderAuthPage("/login");

    await user.type(screen.getByLabelText("Email"), "aayush@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Email or password is incorrect.")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard home")).not.toBeInTheDocument();
  });

  it("navigates to the dashboard on a successful login", async () => {
    vi.spyOn(authApi, "login").mockResolvedValue({
      access_token: "token",
      token_type: "bearer",
      user: { id: "1", name: "Aayush", email: "aayush@example.com", created_at: new Date().toISOString() },
    });
    const user = userEvent.setup();
    renderAuthPage("/login");

    await user.type(screen.getByLabelText("Email"), "aayush@example.com");
    await user.type(screen.getByLabelText("Password"), "password1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByText("Dashboard home")).toBeInTheDocument());
  });

  it("switches to the register tab and shows the password hint", async () => {
    const user = userEvent.setup();
    renderAuthPage("/login");
    await user.click(screen.getByRole("link", { name: "Create account" }));
    expect(await screen.findByText("At least 8 characters.")).toBeInTheDocument();
  });
});
