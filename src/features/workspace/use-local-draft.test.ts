// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useLocalDraft } from "./use-local-draft";
import {
  decodeComposerDraft,
  emptyComposerDraft,
  encodeComposerDraft,
  type ComposerDraft,
} from "./composer-draft";

const storage = vi.hoisted(() => ({
  values: new Map<string, string>(),
  writeGate: null as Promise<void> | null,
  writes: 0,
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => storage.values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      await storage.writeGate;
      storage.writes++;
      storage.values.set(key, value);
    },
    removeItem: async (key: string) => { storage.values.delete(key); },
  },
}));

let root: Root | null;
let draft: ReturnType<typeof useLocalDraft<ComposerDraft>>;
function Editor({ draftKey }: { draftKey: string }) {
  draft = useLocalDraft(draftKey, decodeComposerDraft, encodeComposerDraft);
  return createElement("textarea", { value: draft.value?.text ?? "", readOnly: true });
}
async function mount(draftKey: string) {
  root = createRoot(document.createElement("div"));
  await act(async () => root!.render(createElement(Editor, { draftKey })));
}
async function leave() {
  await act(async () => root?.unmount());
  root = null;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  storage.values.clear();
  storage.writeGate = null;
  storage.writes = 0;
});
afterEach(async () => {
  storage.writeGate = null;
  await leave();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("restores text, attachments and note context when reopening during the previous screen's slow unmount flush", async () => {
  const key = "bycoda.mobile.draft.v1:machine:session";
  await mount(key);
  const edited: ComposerDraft = {
    ...emptyComposerDraft(),
    text: "ui-test",
    attachments: [{
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      claimId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "draft.txt", mimeType: "text/plain", size: 1,
      kind: "file", uri: "file:///draft.txt",
    }],
    noteCard: { id: "note", slug: "review", title: "Reviewed note", body: "Exact context" },
  };
  await act(async () => draft.setValue(edited));
  let finishWrite!: () => void;
  storage.writeGate = new Promise<void>((resolve) => { finishWrite = resolve; });
  await leave();
  await mount(key);
  // A remounted editor must not become editable with stale/empty storage while
  // the previous editor is still retaining the same draft.
  const readyBeforeWrite = draft.ready;
  await act(async () => finishWrite());
  expect(readyBeforeWrite).toBe(false);
  expect(draft.ready).toBe(true);
  expect(draft.value).toEqual(edited);
  await act(async () => vi.advanceTimersByTimeAsync(250));
  expect(decodeComposerDraft(storage.values.get(key)!)).toEqual(edited);
});

it("keeps drafts isolated between sessions and computers across navigation", async () => {
  const first = "bycoda.mobile.draft.v1:machine-a:session";
  const otherSession = "bycoda.mobile.draft.v1:machine-a:another-session";
  const otherMachine = "bycoda.mobile.draft.v1:machine-b:session";
  for (const [key, text] of [[first, "first"], [otherSession, "second"], [otherMachine, "third"]]) {
    await mount(key!);
    expect(draft.value).toBeNull();
    await act(async () => draft.setValue({ ...emptyComposerDraft(), text: text! }));
    await leave();
  }
  for (const [key, text] of [[first, "first"], [otherSession, "second"], [otherMachine, "third"]]) {
    await mount(key!);
    expect(draft.value?.text).toBe(text);
    await leave();
  }
});

it("drops mounted debounce/unmount writers and stale callbacks after an explicit draft purge", async () => {
  const { default: disk } = await import("@react-native-async-storage/async-storage");
  const { withDraftStorageCleanup } = await import("@/state/local-draft-storage");
  const key = "bycoda.mobile.draft.v1:purged:session"; await mount(key);
  await act(async () => draft.setValue({ ...emptyComposerDraft(), text: "delete this" }));
  const old = draft;
  await act(async () => { await withDraftStorageCleanup(disk, async retire => { retire(new Set()); storage.values.delete(key); }); });
  expect(draft.value).toBeNull(); expect(() => old.setValue({ ...emptyComposerDraft(), text: "old callback" })).toThrow("saved draft was cleared");
  await expect(old.persist()).rejects.toThrow("saved draft was cleared");
  await act(async () => { await vi.advanceTimersByTimeAsync(280); }); await leave(); expect(storage.values.has(key)).toBe(false);
});

it("writes a file edit once for autosave and unmount, stores only the compact record and reports it stored", async () => {
  const { encodeFileDraft, parseFileDraft } = await import("./draft-store");
  type Stored = ReturnType<typeof parseFileDraft>;
  const key = "bycoda.mobile.file-draft.v1:machine:file";
  let file!: ReturnType<typeof useLocalDraft<Stored>>;
  function FileHarness() {
    file = useLocalDraft(key, parseFileDraft, encodeFileDraft);
    return null;
  }
  root = createRoot(document.createElement("div"));
  await act(async () => root!.render(createElement(FileHarness)));
  const baseline = `${"unchanged line\n".repeat(200)}end`;
  const edit = { expected: baseline, content: baseline.replace("end", "finish") };
  await act(async () => file.setValue(edit));
  expect(file.isStored).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(250));
  expect(storage.writes).toBe(1);
  expect(file.isStored).toBe(true);
  expect(storage.values.get(key)).toBe(encodeFileDraft(edit));
  expect(parseFileDraft(storage.values.get(key)!)).toEqual(edit);
  await leave();
  expect(storage.writes).toBe(1);
});
