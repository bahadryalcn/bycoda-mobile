import { describe, expect, it } from "vitest";
import type { AgentModel } from "../../../../src/features/sessions/model/models";
import { pickerProviders } from "./model-picker-model";
import type { ProviderChoice } from "./provider-choices";
import { addRecentModel, createRecentModelStore, MAX_RECENT_MODELS, readRecentModels, recentPicks } from "./recent-models";

const storageKey = "bycoda.mobile.recent-models.v1";
function memoryStorage(initial?: string) {
  const data = new Map<string, string>(initial ? [[storageKey, initial]] : []);
  return {
    data,
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => { data.set(key, value); },
  };
}

describe("recent models", () => {
  it("keeps distinct provider, account and model entries, newest first, at most five", () => {
    let list = addRecentModel([], { provider: "codex", model: "gpt" });
    list = addRecentModel(list, { provider: "codex", accountId: "w", model: "gpt" });
    // The default login is one identity however it is named.
    list = addRecentModel(list, { provider: "codex", accountId: "default", model: "gpt" });
    expect(list).toEqual([{ provider: "codex", model: "gpt" }, { provider: "codex", accountId: "w", model: "gpt" }]);
    for (const id of ["a", "b", "c", "d", "e"]) list = addRecentModel(list, { provider: "claude", model: id });
    expect(list).toHaveLength(MAX_RECENT_MODELS);
    expect(list.map((entry) => entry.model)).toEqual(["e", "d", "c", "b", "a"]);
    expect(addRecentModel(list, { provider: "nope" as never, model: "x" })).toEqual(list);
  });

  it("persists per computer and drops malformed stored entries", async () => {
    const storage = memoryStorage(JSON.stringify({
      a: [{ provider: "codex", model: "gpt" }, { provider: "nope", model: "x" }, { provider: "claude", model: "" }],
      b: "broken",
    }));
    expect(readRecentModels("{")).toEqual({});
    const store = createRecentModelStore(storage);
    await store.getState().hydrate();
    expect(store.getState().machines).toEqual({ a: [{ provider: "codex", model: "gpt" }] });
    await store.getState().record("a", { provider: "claude", model: "opus" }, { provider: "codex", model: "gpt" });
    expect(store.getState().machines.a).toEqual([{ provider: "claude", model: "opus" }, { provider: "codex", model: "gpt" }]);
    expect(JSON.parse(storage.data.get(storageKey)!)).toEqual(store.getState().machines);
  });

  it("offers recent models the picker still lists, without the current one, as their family row", () => {
    const model = (id: string, name: string) => ({ id, name } as unknown as AgentModel);
    const gemini = [model("g-low", "Gemini 4 (Low)"), model("g-high", "Gemini 4 (High)")];
    const claude = [model("opus", "Opus 5.5"), model("sonnet", "Sonnet 5.5")];
    const choices: ProviderChoice[] = [
      { key: "claude:", provider: "claude", label: "Default account", detail: "Claude" },
      { key: "claude:w", provider: "claude", accountId: "w", label: "Work", detail: "Claude" },
      { key: "antigravity:", provider: "antigravity", label: "Antigravity" },
    ];
    const providers = pickerProviders(choices, choices[0], claude, "opus", { claude, antigravity: gemini });
    const picks = recentPicks([
      { provider: "claude", model: "opus" },
      { provider: "antigravity", model: "g-high" },
      { provider: "antigravity", model: "g-low" },
      { provider: "claude", accountId: "gone", model: "opus" },
      { provider: "claude", model: "removed" },
      { provider: "claude", accountId: "w", model: "opus" },
      { provider: "claude", model: "sonnet" },
    ], providers);
    expect(picks.map((pick) => [pick.label, pick.detail, pick.model])).toEqual([
      ["Gemini 4", "Antigravity", "g-high"],
      ["Opus 5.5", "Claude · Work", "opus"],
      ["Sonnet 5.5", "Claude · Default account", "sonnet"],
    ]);
    expect(recentPicks([], providers)).toEqual([]);
  });
});
