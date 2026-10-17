import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as journalApi from "../api/journal";
import type { JournalEntry } from "../api/types";
import { useJournalAutosave } from "./useJournalAutosave";

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: "e1",
    title: null,
    body: "Hello",
    mood: null,
    tags: [],
    created_at: "2026-10-17T10:00:00Z",
    updated_at: "2026-10-17T10:00:00Z",
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** A promise we resolve by hand, to hold a request "in flight". */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OPTS = { delayMs: 10, retryMs: 30 };

afterEach(() => vi.restoreAllMocks());

describe("useJournalAutosave", () => {
  it("does not POST until the body has text, then POSTs once and PATCHes after", async () => {
    const create = vi.spyOn(journalApi, "createJournalEntry").mockResolvedValue(makeEntry({ title: "Hi" }));
    const patch = vi.spyOn(journalApi, "updateJournalEntry").mockResolvedValue(makeEntry({ body: "Hello world" }));
    const onCreated = vi.fn();

    const { result } = renderHook(() => useJournalAutosave({ initialEntry: null, onCreated, ...OPTS }), { wrapper });
    expect(result.current.status.kind).toBe("unsaved");

    act(() => result.current.update({ title: "Hi" }));
    await act(() => wait(40));
    expect(create).not.toHaveBeenCalled();
    expect(result.current.status.kind).toBe("unsaved");

    act(() => result.current.update({ body: "   " }));
    await act(() => wait(40));
    expect(create).not.toHaveBeenCalled();

    act(() => result.current.update({ body: "Hello" }));
    await waitFor(() => expect(result.current.status.kind).toBe("saved"));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({ title: "Hi", body: "Hello", mood: null, tags: [] });
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(result.current.entryId).toBe("e1");

    act(() => result.current.update({ body: "Hello world" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    // Only the changed field is sent.
    expect(patch).toHaveBeenCalledWith("e1", { body: "Hello world" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("never creates two entries when typing (or Done) happens during the first POST", async () => {
    const pending = deferred<JournalEntry>();
    const create = vi.spyOn(journalApi, "createJournalEntry").mockReturnValue(pending.promise);
    const patch = vi.spyOn(journalApi, "updateJournalEntry").mockResolvedValue(makeEntry({ body: "Hello again" }));

    const { result } = renderHook(() => useJournalAutosave({ initialEntry: null, ...OPTS }), { wrapper });

    act(() => result.current.update({ body: "Hello" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(result.current.status.kind).toBe("saving");

    // More typing while the POST is still running; its timer fires too.
    act(() => result.current.update({ body: "Hello again" }));
    await act(() => wait(40));
    // And the user hits Done (an explicit flush) at the same time.
    let doneResult: Promise<boolean> | undefined;
    act(() => {
      doneResult = result.current.flush();
    });

    await act(async () => {
      pending.resolve(makeEntry());
      await doneResult;
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith("e1", { body: "Hello again" });
    expect(await doneResult).toBe(true);
    await waitFor(() => expect(result.current.status.kind).toBe("saved"));
    expect(result.current.isDirty).toBe(false);
  });

  it("shows the error state and retries a failed save", async () => {
    const create = vi
      .spyOn(journalApi, "createJournalEntry")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(makeEntry());

    const { result } = renderHook(() => useJournalAutosave({ initialEntry: null, delayMs: 10, retryMs: 300 }), {
      wrapper,
    });
    act(() => result.current.update({ body: "Hello" }));

    await waitFor(() => expect(result.current.status.kind).toBe("error"));
    expect(create).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.status.kind).toBe("saved"));
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("edits an existing entry with PATCH only, and saves other fields if the body is cleared", async () => {
    const create = vi.spyOn(journalApi, "createJournalEntry");
    const patch = vi.spyOn(journalApi, "updateJournalEntry").mockResolvedValue(makeEntry({ mood: 4 }));

    const { result } = renderHook(() => useJournalAutosave({ initialEntry: makeEntry(), ...OPTS }), { wrapper });
    expect(result.current.status.kind).toBe("saved");

    act(() => result.current.update({ body: "", mood: 4 }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    // A blank body is never sent (the API would 422).
    expect(patch).toHaveBeenCalledWith("e1", { mood: 4 });
    await waitFor(() => expect(result.current.status.kind).toBe("unsaved"));
    expect(create).not.toHaveBeenCalled();
  });

  it("stop() cancels a pending autosave (used before delete)", async () => {
    const patch = vi.spyOn(journalApi, "updateJournalEntry").mockResolvedValue(makeEntry());
    const { result } = renderHook(() => useJournalAutosave({ initialEntry: makeEntry(), ...OPTS }), { wrapper });

    act(() => {
      result.current.update({ body: "Changed" });
      result.current.stop();
    });
    await act(() => wait(40));
    expect(patch).not.toHaveBeenCalled();
  });
});
