import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as journalApi from "../api/journal";
import type { JournalEntry, JournalStats } from "../api/types";
import { ToastProvider } from "../context/ToastContext";
import JournalEditorPage from "./JournalEditorPage";

const STATS: JournalStats = {
  month: "2026-10",
  entry_count: 0,
  avg_mood: null,
  days: [],
  total_entries: 0,
  tags: [{ tag: "gym", count: 3 }],
};

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: "e1",
    title: null,
    body: "Hi",
    mood: null,
    tags: [],
    created_at: "2026-10-17T10:58:00Z",
    updated_at: "2026-10-17T10:58:00Z",
    ...overrides,
  };
}

function CurrentPath() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function renderAt(path: string, state?: unknown) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[{ pathname: path, state }]}>
          <Routes>
            <Route path="/journal" element={<div>Journal list</div>} />
            <Route path="/journal/:entryId" element={<JournalEditorPage />} />
          </Routes>
          <CurrentPath />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("JournalEditorPage", () => {
  beforeEach(() => {
    vi.spyOn(journalApi, "getJournalStats").mockResolvedValue(STATS);
  });
  afterEach(() => vi.restoreAllMocks());

  it("creates the entry on first text, swaps the URL to /journal/:id and keeps the same focused textarea", async () => {
    const create = vi.spyOn(journalApi, "createJournalEntry").mockResolvedValue(entry());
    const patch = vi.spyOn(journalApi, "updateJournalEntry").mockResolvedValue(entry({ body: "Hi there" }));
    const user = userEvent.setup();
    renderAt("/journal/new", { prompt: "What went well today?" });

    const body = screen.getByLabelText("Entry");
    expect(body).toHaveAttribute("placeholder", "What went well today?");
    expect(body).toHaveFocus();
    expect(screen.getByText("Not saved yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

    await user.type(body, "Hi");
    await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent("/journal/e1"), { timeout: 3000 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/^Saved · /)).toBeInTheDocument();
    // Same DOM node (no remount) and still focused.
    expect(screen.getByLabelText("Entry")).toBe(body);
    expect(body).toHaveFocus();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();

    await user.type(body, " there");
    await waitFor(() => expect(patch).toHaveBeenCalledWith("e1", { body: "Hi there" }), { timeout: 3000 });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("shows 1 word / 2 words and the suggested tags from stats", async () => {
    vi.spyOn(journalApi, "createJournalEntry").mockResolvedValue(entry());
    const user = userEvent.setup();
    renderAt("/journal/new");

    expect(await screen.findByRole("button", { name: /gym/ })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Entry"), "one two");
    expect(screen.getAllByText("2 words").length).toBeGreaterThan(0);
  });

  it("deletes after confirming, then goes back to the list", async () => {
    vi.spyOn(journalApi, "getJournalEntry").mockResolvedValue(entry({ body: "Old entry" }));
    const del = vi.spyOn(journalApi, "deleteJournalEntry").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderAt("/journal/e1");

    expect(await screen.findByDisplayValue("Old entry")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete entry" }));
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.getByText("Journal list")).toBeInTheDocument());
    expect(del).toHaveBeenCalledWith("e1");
  });

  it("asks before leaving when the change can't be saved (title but no body)", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderAt("/journal/new");

    await user.type(screen.getByLabelText("Title"), "Just a title");
    await user.click(screen.getByRole("link", { name: "Journal" }));

    expect(confirm).toHaveBeenCalled();
    expect(screen.getByTestId("path")).toHaveTextContent("/journal/new");
  });

  it("leaves straight away when nothing was typed", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const user = userEvent.setup();
    renderAt("/journal/new");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByText("Journal list")).toBeInTheDocument());
    expect(confirm).not.toHaveBeenCalled();
  });
});
