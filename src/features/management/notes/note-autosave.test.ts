import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createNoteAutosave, type NoteAutosaveState } from "./note-autosave";
import type { LocalNoteDraft } from "../note-drafts";

const existing: LocalNoteDraft = { id: "n1", title: "Plan", body: "Body", tags: "a", expectedUpdatedAt: 5 };
const blank: LocalNoteDraft = { id: "n2", title: "", body: "", tags: "", expectedUpdatedAt: 0 };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(initial = existing, baseline?: LocalNoteDraft) {
  const states: NoteAutosaveState["status"][] = [];
  let next = 10;
  const write = vi.fn(async (_params: unknown) => ({ updatedAt: next++ }));
  const autosave = createNoteAutosave({
    initial,
    baseline,
    write,
    notify: (state) => states.push(state.status),
    delayMs: 100,
  });
  return { autosave, write, states };
}

it("coalesces a burst of edits into one write and chains the conflict base", async () => {
  const { autosave, write, states } = setup();
  autosave.schedule({ ...existing, body: "B" });
  autosave.schedule({ ...existing, body: "Bo" });
  await vi.advanceTimersByTimeAsync(100);
  expect(write).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenLastCalledWith({
    note: { id: "n1", title: "Plan", body: "Bo", tags: ["a"] },
    expectedUpdatedAt: 5,
  });
  autosave.schedule({ ...existing, body: "Bod", tags: "#Design Work, a" });
  await vi.advanceTimersByTimeAsync(100);
  expect(write).toHaveBeenLastCalledWith({
    note: { id: "n1", title: "Plan", body: "Bod", tags: ["design-work", "a"] },
    expectedUpdatedAt: 10,
  });
  expect(autosave.expectedUpdatedAt).toBe(11);
  expect(states).toEqual(["pending", "saving", "saved", "pending", "saving", "saved"]);
});

it("does not write unchanged content or create an empty note", async () => {
  const { autosave, write } = setup(blank);
  autosave.schedule(blank);
  autosave.schedule({ ...blank, title: "  " });
  await vi.runAllTimersAsync();
  expect(write).not.toHaveBeenCalled();
  const other = setup();
  other.autosave.schedule({ ...existing });
  await vi.runAllTimersAsync();
  expect(other.write).not.toHaveBeenCalled();
});

it("holds a new note while its title is typed, then finalizes the committed title once", async () => {
  const { autosave, write } = setup(blank);
  autosave.schedule({ ...blank, title: "Mee" }, { hold: true });
  await vi.runAllTimersAsync();
  expect(write).not.toHaveBeenCalled();
  autosave.schedule({ ...blank, title: "Meeting" }, { finalize: true });
  await vi.runAllTimersAsync();
  expect(write).toHaveBeenCalledTimes(1);
  expect(write.mock.calls[0]![0]).toMatchObject({ note: { title: "Meeting", finalizeSlug: true }, expectedUpdatedAt: 0 });
  autosave.schedule({ ...blank, title: "Meeting" }, { finalize: true });
  await vi.runAllTimersAsync();
  expect(write).toHaveBeenCalledTimes(1);
});

it("keeps a failed edit for retry and reports the failure", async () => {
  const { autosave, write, states } = setup();
  write.mockRejectedValueOnce(new Error("offline"));
  autosave.schedule({ ...existing, body: "x" });
  await vi.advanceTimersByTimeAsync(100);
  expect(states.at(-1)).toBe("error");
  expect(autosave.unsaved).toBe(true);
  await autosave.flush();
  expect(write).toHaveBeenCalledTimes(2);
  expect(write.mock.calls[1]![0]).toMatchObject({ note: { body: "x" }, expectedUpdatedAt: 5 });
  expect(states.at(-1)).toBe("saved");
});

it("saves a recovered draft that differs from what the computer holds", async () => {
  const recovered = { ...existing, body: "edited offline" };
  const { autosave, write } = setup(recovered, existing);
  autosave.schedule(recovered);
  await vi.runAllTimersAsync();
  expect(write).toHaveBeenCalledTimes(1);
});

it("stops writing before a delete and waits for the write in flight", async () => {
  const { autosave, write } = setup();
  let finish!: (value: { updatedAt: number }) => void;
  write.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  autosave.schedule({ ...existing, body: "1" });
  await vi.advanceTimersByTimeAsync(100);
  autosave.schedule({ ...existing, body: "12" });
  const paused = autosave.pause();
  finish({ updatedAt: 9 });
  await paused;
  await vi.runAllTimersAsync();
  expect(write).toHaveBeenCalledTimes(1);
  expect(autosave.expectedUpdatedAt).toBe(9);
});
