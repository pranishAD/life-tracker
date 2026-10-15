// The one place that knows the API's base URL and how to attach auth.
// Every hook/page calls through the functions in api/*.ts, which call
// `apiFetch` here — nobody else should call `fetch` directly.
import type { ApiErrorBody } from "./types";

// Single source of truth for the backend URL. Falls back to the local
// Docker Compose default so `npm run dev` works even without a .env file.
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";

const TOKEN_KEY = "bihan_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// A typed error so callers can show `err.message` directly and, if they
// care, branch on `err.code` (e.g. "VALIDATION_ERROR" vs "UNAUTHORIZED").
export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

// Fired on any 401 so a single listener (AuthContext) can log the user out
// and redirect, no matter which hook/page triggered the request. Using an
// event instead of importing AuthContext here avoids a circular import
// (AuthContext needs the client, the client would need AuthContext).
export const UNAUTHORIZED_EVENT = "bihan:unauthorized";

function emitUnauthorized() {
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

interface ApiFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Skip attaching the bearer token (only /auth/login and /auth/register). */
  skipAuth?: boolean;
}

function buildUrl(path: string, query?: ApiFetchOptions["query"]): string {
  const url = new URL(API_URL + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = "GET", body, query, skipAuth } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (!skipAuth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 204 No Content (deletes) — nothing to parse.
  if (res.status === 204) return undefined as T;

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const errBody = data as ApiErrorBody | null;
    const code = errBody?.error?.code ?? "UNKNOWN_ERROR";
    const message = errBody?.error?.message ?? `Request failed (${res.status})`;
    if (res.status === 401 && !skipAuth) emitUnauthorized();
    throw new ApiError(res.status, code, message);
  }

  return data as T;
}
