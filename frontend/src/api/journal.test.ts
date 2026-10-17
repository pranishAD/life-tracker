import { afterEach, describe, expect, it, vi } from "vitest";
import { exportJournal, filenameFromDisposition, getJournalStats, listJournalEntries, tzOffset } from "./journal";

function mockFetch(response: Response) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

describe("journal API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("tzOffset is east-positive minutes (the opposite sign of getTimezoneOffset)", () => {
    vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-345); // Nepal
    expect(tzOffset()).toBe(345);
  });

  it("list sends tz_offset, limit/offset and skips blank filters", async () => {
    vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(-345);
    const fetchSpy = mockFetch(new Response(JSON.stringify({ items: [], total: 0, limit: 20, offset: 0 }), { status: 200 }));

    await listJournalEntries({ q: "  ", tag: "gym", limit: 20, offset: 40 });

    const url = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(url.pathname).toMatch(/\/journal$/);
    expect(url.searchParams.get("tz_offset")).toBe("345");
    expect(url.searchParams.get("tag")).toBe("gym");
    expect(url.searchParams.get("offset")).toBe("40");
    expect(url.searchParams.has("q")).toBe(false);
  });

  it("stats sends tz_offset", async () => {
    const fetchSpy = mockFetch(new Response("{}", { status: 200 }));
    await getJournalStats();
    expect(new URL(String(fetchSpy.mock.calls[0][0])).searchParams.has("tz_offset")).toBe(true);
  });

  it("export fetches text with the Bearer token and reads the count headers", async () => {
    localStorage.setItem("bihan_token", "abc");
    const fetchSpy = mockFetch(
      new Response("# Bihan journal", {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": 'attachment; filename="bihan-journal-2026-09-18-to-2026-10-17.md"',
          "X-Journal-Entry-Count": "24",
          "X-Journal-Word-Count": "6312",
          "X-Journal-Goal-Count": "7",
        },
      }),
    );

    const result = await exportJournal({ from: "2026-09-18", to: "2026-10-17", include_goals: false });

    const [rawUrl, init] = fetchSpy.mock.calls[0];
    const url = new URL(String(rawUrl));
    expect(url.pathname).toMatch(/\/journal\/export$/);
    expect(url.searchParams.get("from")).toBe("2026-09-18");
    expect(url.searchParams.get("include_goals")).toBe("false");
    expect(url.searchParams.has("tz_offset")).toBe(true);
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer abc");
    expect(result).toEqual({
      markdown: "# Bihan journal",
      entryCount: 24,
      wordCount: 6312,
      goalCount: 7,
      filename: "bihan-journal-2026-09-18-to-2026-10-17.md",
    });
  });

  it("export with no `from` leaves it out of the query (All time)", async () => {
    const fetchSpy = mockFetch(new Response("", { status: 200 }));
    const result = await exportJournal({ to: "2026-10-17", include_goals: true });
    expect(new URL(String(fetchSpy.mock.calls[0][0])).searchParams.has("from")).toBe(false);
    // Missing headers fall back to 0 / null rather than NaN.
    expect(result.entryCount).toBe(0);
    expect(result.filename).toBeNull();
  });

  it("filenameFromDisposition", () => {
    expect(filenameFromDisposition('attachment; filename="a.md"')).toBe("a.md");
    expect(filenameFromDisposition("attachment; filename=b.md")).toBe("b.md");
    expect(filenameFromDisposition(null)).toBeNull();
  });
});
