import { describe, expect, it } from "vitest";
import { createLastCreationChoiceStore, rememberedDraft } from "./last-creation-choice";
import type { HostModelCatalog } from "./wire";

const catalog = { models: { codex: [{ id: "gpt-5" }] }, errors: {} } as unknown as HostModelCatalog;

function memoryStorage(initial?: string) {
  const data = new Map<string, string>(initial ? [["bycoda.mobile.new-session-choice.v1", initial]] : []);
  return {
    data,
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => { data.set(key, value); },
  };
}

describe("last creation choice", () => {
  it("is only used while the computer still offers the model", () => {
    expect(rememberedDraft({ provider: "codex", model: "gpt-5" }, catalog)).toEqual({ provider: "codex", accountId: undefined, model: "gpt-5" });
    expect(rememberedDraft({ provider: "codex", model: "gone" }, catalog)).toBeUndefined();
    expect(rememberedDraft({ provider: "claude", model: "gpt-5" }, catalog)).toBeUndefined();
    expect(rememberedDraft({ provider: "codex", model: "gpt-5" }, undefined)).toBeUndefined();
    expect(rememberedDraft(undefined, catalog)).toBeUndefined();
  });

  it("persists per computer and drops malformed stored entries", async () => {
    const storage = memoryStorage(JSON.stringify({ a: { provider: "codex", model: "gpt-5", accountId: "work" }, b: { provider: "nope", model: "x" }, c: 5 }));
    const store = createLastCreationChoiceStore(storage);
    await store.getState().hydrate();
    expect(Object.keys(store.getState().machines)).toEqual(["a"]);
    await store.getState().remember("b", { provider: "codex", model: "gpt-5" });
    expect(JSON.parse(storage.data.get("bycoda.mobile.new-session-choice.v1")!)).toMatchObject({
      a: { model: "gpt-5", accountId: "work" },
      b: { provider: "codex", model: "gpt-5" },
    });
  });
});
