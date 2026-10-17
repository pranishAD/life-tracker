import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as journalApi from "../api/journal";
import type { JournalEntry, JournalEntryPage, JournalStats } from "../api/types";
import JournalPage from "./JournalPage";

function stats(overrides: Partial<JournalStats> = {}): JournalStats {
  return {
    month: "2026-10",
    entry_count: 23,
    avg_mood: 3.8,
    days: [],
    total_entries: 30,
    tags: [
      { tag: "gym", count: 9 },
      { tag: "study", count: 4 },
    ],
    ...overrides,
  };
}

function makeEntries(n: number, start = 0): JournalEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `e${start + i}`,
    title: `Entry ${start + i}`,
    body: "Squats felt heavy.",
    mood: 4,
    tags: ["gym"],
    created_at: new Date(Date.now() - (start + i) * 3600_000).toISOString(),
    updated_at: new Date().toISOString(),
  }));
}

function page(items: JournalEntry[], total: number, offset = 0): JournalEntryPage {
  return { items, total, limit: 20, offset };
}

function EditorProbe() {
  const state = useLocation().state as { prompt?: string } | null;
  return <div>Editor: {state?.prompt ?? "blank"}</div>;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/journal"]}>
        <Routes>
          <Route path="/journal" element={<JournalPage />} />
          <Route path="/journal/new" element={<EditorProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("JournalPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the empty state with Export disabled, and a prompt opens the editor with it", async () => {
    vi.spyOn(journalApi, "getJournalStats").mockResolvedValue(stats({ entry_count: 0, total_entries: 0, tags: [] }));
    vi.spyOn(journalApi, "listJournalEntries").mockResolvedValue(page([], 0));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Your journal is empty")).toBeInTheDocument();
    expect(screen.getByText("0 entries this month")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export for AI/ })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "What went well today?" }));
    expect(screen.getByText("Editor: What went well today?")).toBeInTheDocument();
  });

  it("lists entries under group headings, then shows no-results with Clear search", async () => {
    vi.spyOn(journalApi, "getJournalStats").mockResolvedValue(stats());
    const list = vi
      .spyOn(journalApi, "listJournalEntries")
      .mockImplementation(async (p) => (p?.q ? page([], 0) : page(makeEntries(2), 2)));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Entry 0")).toBeInTheDocument();
    expect(screen.getByText("23 entries this month")).toBeInTheDocument();
    expect(screen.getByText("This week")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search entries and tags"), "squat");
    expect(await screen.findByText('No entries match "squat"')).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ q: "squat", offset: 0, limit: 20 }));

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(await screen.findByText("Entry 0")).toBeInTheDocument();
    expect(screen.getByLabelText("Search entries and tags")).toHaveValue("");
  });

  it("filters by one tag at a time", async () => {
    vi.spyOn(journalApi, "getJournalStats").mockResolvedValue(stats());
    const list = vi.spyOn(journalApi, "listJournalEntries").mockResolvedValue(page(makeEntries(1), 1));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Entry 0");

    // The tag row chip (the rail's Tags card has its own button too).
    await user.click(screen.getAllByRole("button", { name: /study/ })[0]);
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ tag: "study" })));
  });

  it("loads the next page at offset 20 and stops when offset >= total", async () => {
    vi.spyOn(journalApi, "getJournalStats").mockResolvedValue(stats());
    const list = vi
      .spyOn(journalApi, "listJournalEntries")
      .mockImplementation(async (p) =>
        p?.offset === 20 ? page(makeEntries(5, 20), 25, 20) : page(makeEntries(20), 25, 0),
      );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Entry 0");

    // jsdom has no IntersectionObserver, so the page shows a "Load more" fallback.
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Entry 24")).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ offset: 20 }));
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });
});
