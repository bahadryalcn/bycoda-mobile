import { truncateCodeUnits } from "../../../../src/shared/lib/text/truncate";
import { DICTATION_LANGUAGES } from "../../../../src/features/voice/model/dictationModels";

/**
 * The desktop's dictation settings, kept on this phone: the spoken language, custom words, filler
 * removal, the computer's silence filter and the opt-in text cleanup. Field names, defaults and
 * limits are the desktop's (`src/features/voice/model/voiceSettings.ts`), so both behave alike.
 */
export type DictationDictionaryEntry = { term: string; aliases: string[]; projectId?: string };
export type DictationCleanup = {
  enabled: boolean;
  /** Codex model id; empty uses the computer's Codex default. */
  model: string;
  instructions: string;
  /** Spoken phrase that marks a self-correction, such as "scratch that". */
  correctionCue: string;
  translateToEnglish: boolean;
};
export type DictationPreferences = {
  /** "auto" lets the recognizer detect the language; a primary subtag ("tr", "zh") forces it. */
  dictationLanguage: string;
  dictationDictionary: DictationDictionaryEntry[];
  dictationRemoveFillers: boolean;
  dictationSilenceFilter: boolean;
  dictationCleanup: DictationCleanup;
};

/** The desktop's stored limits. */
export const DICTATION_LIMITS = {
  entries: 500, term: 200, aliases: 30, alias: 200, projectId: 300,
  model: 200, instructions: 4000, correctionCue: 100,
} as const;

export const defaultDictationCleanup: DictationCleanup = { enabled: false, model: "", instructions: "", correctionCue: "", translateToEnglish: false };
export const defaultDictationPreferences: DictationPreferences = {
  dictationLanguage: "auto",
  dictationDictionary: [],
  dictationRemoveFillers: false,
  dictationSilenceFilter: true,
  dictationCleanup: defaultDictationCleanup,
};

/** Dictation languages by native name ("Türkçe", "日本語"), as the desktop lists them. */
export const DICTATION_LANGUAGE_OPTIONS = DICTATION_LANGUAGES;

export function isDictationLanguage(value: unknown): value is string {
  return value === "auto" || DICTATION_LANGUAGES.some(([code]) => code === value);
}

const boundedText = (value: unknown, max: number) => typeof value === "string" ? truncateCodeUnits(value, max) : "";

export function parseDictationDictionary(value: unknown): DictationDictionaryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, DICTATION_LIMITS.entries).flatMap((entry: unknown): DictationDictionaryEntry[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as { term?: unknown; aliases?: unknown; projectId?: unknown };
    const term = boundedText(item.term, DICTATION_LIMITS.term).trim();
    if (!term) return [];
    const aliases = Array.isArray(item.aliases)
      ? item.aliases.slice(0, DICTATION_LIMITS.aliases).map(alias => boundedText(alias, DICTATION_LIMITS.alias).trim()).filter(Boolean)
      : [];
    const projectId = boundedText(item.projectId, DICTATION_LIMITS.projectId).trim();
    return [{ term, aliases, ...(projectId ? { projectId } : {}) }];
  });
}

export function normalizeDictationCleanup(value: unknown): DictationCleanup {
  const data = value && typeof value === "object" ? (value as Partial<Record<keyof DictationCleanup, unknown>>) : {};
  return {
    enabled: data.enabled === true,
    model: boundedText(data.model, DICTATION_LIMITS.model),
    instructions: boundedText(data.instructions, DICTATION_LIMITS.instructions),
    correctionCue: boundedText(data.correctionCue, DICTATION_LIMITS.correctionCue),
    translateToEnglish: data.translateToEnglish === true,
  };
}

/** Missing or damaged fields read as the desktop defaults; a stored record without them is an older app. */
export function normalizeDictationPreferences(data: Partial<Record<keyof DictationPreferences, unknown>>): DictationPreferences {
  return {
    dictationLanguage: isDictationLanguage(data.dictationLanguage) ? data.dictationLanguage : "auto",
    dictationDictionary: parseDictationDictionary(data.dictationDictionary),
    dictationRemoveFillers: data.dictationRemoveFillers === true,
    dictationSilenceFilter: data.dictationSilenceFilter !== false,
    dictationCleanup: normalizeDictationCleanup(data.dictationCleanup),
  };
}

/** Spoken aliases typed as one comma- or line-separated text; repeats and the term itself are dropped. */
export function parseDictationAliases(text: string, term = ""): string[] {
  const seen = new Set([term.trim().toLocaleLowerCase()].filter(Boolean));
  const aliases: string[] = [];
  for (const part of text.split(/[,\n]/)) {
    const alias = truncateCodeUnits(part.trim(), DICTATION_LIMITS.alias).trim();
    const key = alias.toLocaleLowerCase();
    if (!alias || seen.has(key)) continue;
    seen.add(key);
    aliases.push(alias);
    if (aliases.length >= DICTATION_LIMITS.aliases) break;
  }
  return aliases;
}

export type DictionaryEditError = "empty" | "duplicate" | "full";
/** Same spelling in the same scope; case and surrounding spaces do not make a different term (desktop rule). */
const termKey = (entry: Pick<DictationDictionaryEntry, "term" | "projectId">) => `${entry.projectId ?? ""}\n${entry.term.trim().toLowerCase()}`;

/**
 * Adds a term (`editing` null) or replaces the edited one, found again by its spelling and scope, so
 * a list changed meanwhile never loses another term. An edited term that is gone is added as new.
 * A term already saved in the same scope, an empty term or a full dictionary is refused with the reason.
 */
export function saveDictionaryEntry(entries: readonly DictationDictionaryEntry[], editing: DictationDictionaryEntry | null, draft: { term: string; aliases: string }):
  { entries: DictationDictionaryEntry[] } | { error: DictionaryEditError } {
  const term = truncateCodeUnits(draft.term.trim(), DICTATION_LIMITS.term).trim();
  if (!term) return { error: "empty" };
  const index = editing ? entries.findIndex(item => termKey(item) === termKey(editing)) : -1;
  const entry: DictationDictionaryEntry = { term, aliases: parseDictationAliases(draft.aliases, term), ...(editing?.projectId ? { projectId: editing.projectId } : {}) };
  if (entries.some((item, at) => at !== index && termKey(item) === termKey(entry))) return { error: "duplicate" };
  if (index < 0) {
    if (entries.length >= DICTATION_LIMITS.entries) return { error: "full" };
    return { entries: [...entries, entry] };
  }
  return { entries: entries.map((item, at) => at === index ? entry : item) };
}

/** Removes the chosen term by its spelling and scope, so a list changed meanwhile never loses another one. */
export function removeDictionaryEntry(entries: readonly DictationDictionaryEntry[], removed: DictationDictionaryEntry): DictationDictionaryEntry[] {
  const index = entries.findIndex(item => termKey(item) === termKey(removed));
  return index < 0 ? [...entries] : entries.filter((_, at) => at !== index);
}
