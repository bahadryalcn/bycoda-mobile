import { expect, it } from "vitest";
import { normalizeDictationPreferences, parseDictationAliases, removeDictionaryEntry, saveDictionaryEntry } from "./dictation-preferences";
import { normalizeVoicePreferences } from "./voice-preferences";

// The phone had none of the desktop's dictation settings; a record saved before them keeps its choices.
it("reads an older voice record with the desktop's dictation defaults and keeps its other choices", () => {
  const preferences = normalizeVoicePreferences({ engine: "openai", phoneDictation: true });
  expect(preferences).toMatchObject({
    engine: "openai", phoneDictation: true,
    dictationLanguage: "auto", dictationDictionary: [], dictationRemoveFillers: false, dictationSilenceFilter: true,
    dictationCleanup: { enabled: false, model: "", instructions: "", correctionCue: "", translateToEnglish: false },
  });
});

it("keeps only the desktop's languages and bounds stored text the way the desktop does", () => {
  expect(normalizeDictationPreferences({ dictationLanguage: "tr" }).dictationLanguage).toBe("tr");
  expect(normalizeDictationPreferences({ dictationLanguage: "zh" }).dictationLanguage).toBe("zh");
  expect(normalizeDictationPreferences({ dictationLanguage: "tr-TR" }).dictationLanguage).toBe("auto");
  expect(normalizeDictationPreferences({ dictationLanguage: "xx" }).dictationLanguage).toBe("auto");
  expect(normalizeDictationPreferences({ dictationSilenceFilter: false }).dictationSilenceFilter).toBe(false);
  expect(normalizeDictationPreferences({ dictationSilenceFilter: "no" }).dictationSilenceFilter).toBe(true);
  const cleanup = normalizeDictationPreferences({ dictationCleanup: { enabled: true, instructions: "x".repeat(5000), correctionCue: "y".repeat(150), model: 7 } }).dictationCleanup;
  expect(cleanup).toMatchObject({ enabled: true, model: "", translateToEnglish: false });
  expect(cleanup.instructions).toHaveLength(4000);
  expect(cleanup.correctionCue).toHaveLength(100);
  const dictionary = normalizeDictationPreferences({ dictationDictionary: [
    { term: "  TypeScript ", aliases: [" tayp skript ", "", 4], projectId: "p1" }, { term: "   " }, null, "x",
    ...Array.from({ length: 600 }, (_, index) => ({ term: `t${index}` })),
  ] }).dictationDictionary;
  expect(dictionary[0]).toEqual({ term: "TypeScript", aliases: ["tayp skript"], projectId: "p1" });
  expect(dictionary).toHaveLength(497);
});

it("adds, edits and removes custom words by spelling, refusing an empty or repeated term and a full list", () => {
  const first = saveDictionaryEntry([], null, { term: " bycoda ", aliases: "bay coda, Bycoda, bay coda, baykoda" });
  expect(first).toEqual({ entries: [{ term: "bycoda", aliases: ["bay coda", "baykoda"] }] });
  const entries = "entries" in first ? first.entries : [];
  expect(saveDictionaryEntry(entries, null, { term: "  ", aliases: "" })).toEqual({ error: "empty" });
  expect(saveDictionaryEntry(entries, null, { term: "BYCODA", aliases: "" })).toEqual({ error: "duplicate" });
  // Editing keeps the entry's place; editing a term that is gone adds it instead of overwriting another.
  expect(saveDictionaryEntry(entries, entries[0]!, { term: "Bycoda", aliases: "bay koda" })).toEqual({ entries: [{ term: "Bycoda", aliases: ["bay koda"] }] });
  expect(saveDictionaryEntry([{ term: "other", aliases: [] }], entries[0]!, { term: "bycoda", aliases: "" }))
    .toEqual({ entries: [{ term: "other", aliases: [] }, { term: "bycoda", aliases: [] }] });
  const full = Array.from({ length: 500 }, (_, index) => ({ term: `t${index}`, aliases: [] }));
  expect(saveDictionaryEntry(full, null, { term: "new", aliases: "" })).toEqual({ error: "full" });
  expect(saveDictionaryEntry(full, full[3]!, { term: "renamed", aliases: "" })).toMatchObject({ entries: expect.any(Array) });
  expect(removeDictionaryEntry([{ term: "a", aliases: [] }, { term: "B", aliases: [] }], { term: "b", aliases: [] })).toEqual([{ term: "a", aliases: [] }]);
  expect(removeDictionaryEntry([{ term: "a", aliases: [] }], { term: "gone", aliases: [] })).toEqual([{ term: "a", aliases: [] }]);
});

it("splits spoken forms on commas and lines and keeps at most the desktop's thirty", () => {
  expect(parseDictationAliases("a,\nb , ,A", "x")).toEqual(["a", "b"]);
  expect(parseDictationAliases(Array.from({ length: 40 }, (_, index) => `w${index}`).join(","))).toHaveLength(30);
});
