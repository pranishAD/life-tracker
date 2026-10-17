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
  query?: Record<string, string | number | boolean | undefined>;
  /** Skip attaching the bearer token (only /auth/login and /auth/register). */
  skipAuth?: boolean;
}

function buildUrl(path: string, query?: ApiFetchOptions["query"]): string {
  // We can't use `new URL(API_URL + path)` here: the `URL` constructor
  // requires an absolute base and throws `TypeError: Invalid URL` when
  // `API_URL` is a relative path like "/api/v1" (production, same-origin
  // Vercel deploy). Building the string by hand works for both an absolute
  // URL (local dev) and a relative one (production).
  const base = API_URL.replace(/\/$/, ""); // strip trailing slash, if any
  let url = base + path;

  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  return url;
}

function buildHeaders(hasJsonBody: boolean, skipAuth?: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (hasJsonBody) headers["Content-Type"] = "application/json";
  if (!skipAuth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/** Turn a non-2xx response into an ApiError (and fire the 401 event). */
async function throwApiError(res: Response, skipAuth?: boolean): Promise<never> {
  let errBody: ApiErrorBody | null = null;
  try {
    errBody = (await res.json()) as ApiErrorBody;
  } catch {
    errBody = null;
  }
  const code = errBody?.error?.code ?? "UNKNOWN_ERROR";
  const message = errBody?.error?.message ?? `Request failed (${res.status})`;
  if (res.status === 401 && !skipAuth) emitUnauthorized();
  throw new ApiError(res.status, code, message);
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = "GET", body, query, skipAuth } = options;

  const res = await fetch(buildUrl(path, query), {
    method,
    headers: buildHeaders(body !== undefined, skipAuth),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) return throwApiError(res, skipAuth);

  // 204 No Content (deletes) — nothing to parse.
  if (res.status === 204) return undefined as T;

  try {
    return (await res.json()) as T;
  } catch {
    return null as T;
  }
}

/**
 * Like `apiFetch`, but for endpoints that return a file instead of JSON
 * (the journal Markdown export). Same base URL, same Bearer token, same 401
 * handling — it just hands back the body as text plus the response headers,
 * so callers can read things like `X-Journal-Entry-Count`.
 */
export async function apiFetchText(
  path: string,
  options: Pick<ApiFetchOptions, "query"> = {},
): Promise<{ text: string; headers: Headers }> {
  const res = await fetch(buildUrl(path, options.query), {
    method: "GET",
    headers: buildHeaders(false),
  });
  if (!res.ok) return throwApiError(res);
  return { text: await res.text(), headers: res.headers };
}
