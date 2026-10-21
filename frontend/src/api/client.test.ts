import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiFetch,
  ApiError,
  clearToken,
  getToken,
  RATE_LIMITED_CODE,
  RATE_LIMITED_MESSAGE,
  setToken,
  UNAUTHORIZED_EVENT,
} from "./client";

describe("token persistence", () => {
  afterEach(() => localStorage.clear());

  it("round-trips through localStorage", () => {
    expect(getToken()).toBeNull();
    setToken("abc.def.ghi");
    expect(getToken()).toBe("abc.def.ghi");
    clearToken();
    expect(getToken()).toBeNull();
  });
});

describe("apiFetch error handling", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves with the parsed JSON body on success", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ hello: "world" }), { status: 200 }),
    );
    const result = await apiFetch<{ hello: string }>("/health");
    expect(result).toEqual({ hello: "world" });
  });

  it("throws an ApiError with the backend's code and message on failure", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "email is required" } }), {
        status: 422,
      }),
    );
    await expect(apiFetch("/auth/register", { method: "POST", body: {} })).rejects.toMatchObject({
      status: 422,
      code: "VALIDATION_ERROR",
      message: "email is required",
    });
  });

  it("is an instance of ApiError so callers can narrow with instanceof", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "no such goal" } }), { status: 404 }),
    );
    try {
      await apiFetch("/goals/missing");
      expect.unreachable("apiFetch should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
    }
  });

  it("treats 204 No Content as success with no body (DELETE endpoints)", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiFetch("/goals/some-id", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("attaches the stored bearer token to authenticated requests", async () => {
    setToken("my-jwt");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await apiFetch("/dashboard");
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer my-jwt");
  });

  it("does not attach a token when skipAuth is set (login/register)", async () => {
    setToken("my-jwt");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await apiFetch("/auth/login", { method: "POST", body: {}, skipAuth: true });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("emits a global unauthorized event on 401 so AuthContext can log out", async () => {
    setToken("expired");
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Token expired" } }), { status: 401 }),
    );
    const handler = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, handler);
    await expect(apiFetch("/dashboard")).rejects.toThrow("Token expired");
    expect(handler).toHaveBeenCalledOnce();
    window.removeEventListener(UNAUTHORIZED_EVENT, handler);
  });

  // SEC-001: the Vercel firewall answers 429 before our backend sees the
  // request, so the body is not our {"error": {...}} JSON.
  it.each([
    ["an HTML body", "<html><body><h1>429 Too Many Requests</h1></body></html>"],
    ["an empty body", null],
    ["a plain-text body", "Too Many Requests"],
    ["JSON in a different shape", JSON.stringify({ error: "rate_limited" })],
  ])("turns a 429 with %s into a friendly RATE_LIMITED error", async (_label, body) => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(body, { status: 429, headers: { "Content-Type": "text/html" } }),
    );
    await expect(
      apiFetch("/auth/login", { method: "POST", body: {}, skipAuth: true }),
    ).rejects.toMatchObject({
      status: 429,
      code: RATE_LIMITED_CODE,
      message: RATE_LIMITED_MESSAGE,
    });
  });

  it("keeps the backend's own message if a 429 does use the contract shape", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "TOO_MANY_ATTEMPTS", message: "Locked for 15 minutes." } }), {
        status: 429,
      }),
    );
    await expect(apiFetch("/auth/login", { method: "POST", body: {}, skipAuth: true })).rejects.toMatchObject({
      status: 429,
      code: "TOO_MANY_ATTEMPTS",
      message: "Locked for 15 minutes.",
    });
  });

  it("does NOT emit the unauthorized (logout) event on a 429, even for authenticated requests", async () => {
    setToken("valid");
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 429 }));
    const handler = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, handler);
    await expect(apiFetch("/dashboard")).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
    expect(getToken()).toBe("valid");
    window.removeEventListener(UNAUTHORIZED_EVENT, handler);
  });

  it("falls back to a generic message for a non-JSON body on other errors (e.g. 502 HTML)", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }));
    await expect(apiFetch("/dashboard")).rejects.toMatchObject({
      status: 502,
      code: "UNKNOWN_ERROR",
      message: "Request failed (502)",
    });
  });

  it("builds a request against an absolute VITE_API_URL (local dev, unchanged)", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await apiFetch("/goals", { query: { status: "active" } });
    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/v1/goals?status=active");
  });
});

// `API_URL` is read once at module load from `import.meta.env.VITE_API_URL`,
// so to exercise a different value (the production, same-origin case) we
// stub the env var, reset the module registry, and re-import the module —
// that gives us a fresh `client.ts` instance that picks up the new value.
describe("apiFetch with a relative VITE_API_URL (production, Vercel Services)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubEnv("VITE_API_URL", "/api/v1");
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does not throw and builds a same-origin relative path instead of an absolute URL", async () => {
    const { apiFetch: apiFetchWithRelativeUrl } = await import("./client");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(apiFetchWithRelativeUrl("/dashboard")).resolves.toEqual({ ok: true });

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/dashboard");
  });

  it("still appends query params correctly on a relative base", async () => {
    const { apiFetch: apiFetchWithRelativeUrl } = await import("./client");
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    await apiFetchWithRelativeUrl("/goals", { query: { status: "active", page: 2 } });

    const [url] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/goals?status=active&page=2");
  });
});
