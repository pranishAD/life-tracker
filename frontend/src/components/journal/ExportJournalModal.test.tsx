import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as journalApi from "../../api/journal";
import type { JournalExport } from "../../api/types";
import { presetRange } from "../../lib/journal";
import ExportJournalModal from "./ExportJournalModal";

const MARKDOWN = [
  "# Bihan journal: Sep 18 – Oct 17, 2026",
  "Exported: Oct 17, 2026 · 24 entries",
  "",
  "## Entries",
  "### Sat, Oct 17 · Leg day finally",
  "Mood: 4/5 (Good) · Tags: #gym #legs",
  "Squats felt heavy.",
].join("\n");

function file(overrides: Partial<JournalExport> = {}): JournalExport {
  return {
    markdown: MARKDOWN,
    entryCount: 24,
    wordCount: 6312,
    goalCount: 7,
    filename: "bihan-journal-2026-09-18-to-2026-10-17.md",
    ...overrides,
  };
}

function renderModal(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ExportJournalModal onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

describe("ExportJournalModal", () => {
  beforeEach(() => {
    // jsdom has no object URLs; stub them so the download path can run.
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it("fetches the last 30 days with goals by default and shows the summary from the headers", async () => {
    const spy = vi.spyOn(journalApi, "exportJournal").mockResolvedValue(file());
    renderModal();

    expect(await screen.findByText("24 entries")).toBeInTheDocument();
    expect(screen.getByText(/about 6,300 words · 7 goals/)).toBeInTheDocument();
    expect(screen.getByText("bihan-journal-2026-09-18-to-2026-10-17.md")).toBeInTheDocument();
    expect(screen.getByText("# Bihan journal: Sep 18 – Oct 17, 2026")).toBeInTheDocument();

    const range = presetRange("30d");
    expect(spy).toHaveBeenCalledWith({ from: range.from, to: range.to, include_goals: true });
    expect(screen.getByRole("button", { name: "Last 30 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("switch", { name: /Include goals and scores/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: /Download .md/ })).toBeEnabled();
  });

  it("re-fetches without goals when the toggle is turned off", async () => {
    const spy = vi
      .spyOn(journalApi, "exportJournal")
      .mockImplementation(async (p) => file({ goalCount: p.include_goals ? 7 : 0 }));
    const user = userEvent.setup();
    renderModal();
    await screen.findByText("24 entries");

    await user.click(screen.getByRole("switch", { name: /Include goals and scores/ }));
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ include_goals: false })));
    await waitFor(() => expect(screen.getByText(/about 6,300 words$/)).toBeInTheDocument());
  });

  it('"All time" omits `from`; editing a date deselects the preset', async () => {
    const spy = vi.spyOn(journalApi, "exportJournal").mockResolvedValue(file());
    const user = userEvent.setup();
    renderModal();
    await screen.findByText("24 entries");

    await user.click(screen.getByRole("button", { name: "All time" }));
    await waitFor(() =>
      expect(spy).toHaveBeenLastCalledWith({ from: undefined, to: presetRange("all").to, include_goals: true }),
    );

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    for (const name of ["Last 7 days", "Last 30 days", "This month", "All time"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ from: "2026-10-01" })));
  });

  it('shows "No entries in this range" and disables Download when the range is empty', async () => {
    vi.spyOn(journalApi, "exportJournal").mockResolvedValue(file({ entryCount: 0, wordCount: 0 }));
    renderModal();

    expect(await screen.findByText("No entries in this range")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download .md/ })).toBeDisabled();
  });

  it("downloads the already-fetched text without a second request", async () => {
    const spy = vi.spyOn(journalApi, "exportJournal").mockResolvedValue(file());
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await screen.findByText("24 entries");
    const callsBefore = spy.mock.calls.length;

    await user.click(screen.getByRole("button", { name: /Download .md/ }));

    expect(click).toHaveBeenCalledTimes(1);
    const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
    // jsdom's Blob has no .text(), so read it the old way.
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text).toBe(MARKDOWN);
    expect(spy.mock.calls.length).toBe(callsBefore);
    expect(onClose).toHaveBeenCalled();
  });

  it("blocks a From date after To", async () => {
    vi.spyOn(journalApi, "exportJournal").mockResolvedValue(file());
    renderModal();
    await screen.findByText("24 entries");

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2099-01-01" } });
    expect(screen.getByText("From must be on or before To.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download .md/ })).toBeDisabled();
  });
});
