import { beforeEach, expect, it, vi } from "vitest";
const disk = vi.hoisted(() => {
  const values = new Map<string, string>();
  return { values, getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { values.delete(key); }) };
});
vi.mock("@react-native-async-storage/async-storage", () => ({ default: disk }));
import { decodeAssistantDraft, encodeAssistantDraft, mergePendingSpeech, pendingSpeechKey } from "./assistant-speech-draft";
const target = { machineId: "host-a", environmentId: "env-a", threadId: "room-a" };
beforeEach(() => { vi.resetModules(); disk.values.clear(); vi.clearAllMocks(); });

it("restores pending recognized text with its exact computer and Room after an app restart", async () => {
  const first = await import("./assistant-companion-state");
  const speech = await first.retainAssistantSpeech(target, "Recognized on phone");
  expect(disk.values.has(pendingSpeechKey)).toBe(true);
  vi.resetModules();
  const restarted = await import("./assistant-companion-state");
  await restarted.hydrateAssistantSpeech();
  expect(restarted.useAssistantCompanion.getState().transcript).toEqual(speech);
});

it("does not lose the in-memory recovery record on storage failure or replace it with a second recording", async () => {
  const state = await import("./assistant-companion-state");
  disk.setItem.mockRejectedValueOnce(new Error("disk full"));
  await expect(state.retainAssistantSpeech(target, "Keep this speech")).rejects.toThrow("disk full");
  expect(state.useAssistantCompanion.getState().transcript?.text).toBe("Keep this speech");
  await expect(state.retainAssistantSpeech({ ...target, threadId: "room-b" }, "Other speech")).rejects.toThrow("awaiting recovery");
  state.closeAssistantCompanion();
  expect(state.useAssistantCompanion.getState().transcript?.text).toBe("Keep this speech");
});

it("imports once when the draft saved but clearing pending speech failed, including after restart", async () => {
  const state = await import("./assistant-companion-state");
  const speech = await state.retainAssistantSpeech(target, "Add this once");
  const imported = mergePendingSpeech(decodeAssistantDraft("Typed before speech"), speech);
  const saved = encodeAssistantDraft(imported)!;
  disk.removeItem.mockRejectedValueOnce(new Error("disk busy"));
  await expect(state.consumeAssistantSpeech(speech)).rejects.toThrow("disk busy");
  expect(state.useAssistantCompanion.getState().transcript).toEqual(speech);
  vi.resetModules();
  const restarted = await import("./assistant-companion-state");
  await restarted.hydrateAssistantSpeech();
  expect(mergePendingSpeech(decodeAssistantDraft(saved), restarted.useAssistantCompanion.getState().transcript!)).toEqual(imported);
  await restarted.consumeAssistantSpeech(speech);
  expect(restarted.useAssistantCompanion.getState().transcript).toBeUndefined();
  expect(disk.values.has(pendingSpeechKey)).toBe(false);
});

it("keeps legacy text and refuses oversized merges without truncation", () => {
  expect(decodeAssistantDraft("Legacy text")).toEqual({ text: "Legacy text", speechIds: [] });
  expect(() => mergePendingSpeech({ text: "x".repeat(16000), speechIds: [] }, { id: "speech", target, text: "extra" })).toThrow("too long");
});

it("does not resurrect deleted speech when pending cleanup failed before restart", async () => {
  const state = await import("./assistant-companion-state");
  const speech = await state.retainAssistantSpeech(target, "Delete this recognized text");
  const imported = mergePendingSpeech(null, speech);
  disk.removeItem.mockRejectedValueOnce(new Error("disk busy"));
  await expect(state.consumeAssistantSpeech(speech)).rejects.toThrow("disk busy");
  const deleted = { ...imported, text: "" };
  const saved = encodeAssistantDraft(deleted);
  expect(saved).not.toBeNull();
  vi.resetModules();
  const restarted = await import("./assistant-companion-state");
  await restarted.hydrateAssistantSpeech();
  expect(mergePendingSpeech(decodeAssistantDraft(saved!), restarted.useAssistantCompanion.getState().transcript!)).toEqual(deleted);
});
