import { apiFetch } from "./client";
import type { AuthResponse, User } from "./types";

export function login(email: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: { email, password },
    skipAuth: true,
  });
}

export function register(name: string, email: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: { name, email, password },
    skipAuth: true,
  });
}

export function getMe(): Promise<User> {
  return apiFetch<User>("/auth/me");
}

export function updateMe(name: string): Promise<User> {
  return apiFetch<User>("/auth/me", { method: "PATCH", body: { name } });
}
