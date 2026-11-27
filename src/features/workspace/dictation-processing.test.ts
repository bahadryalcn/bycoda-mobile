import { expect, it, vi } from "vitest";
import { AssistantVoice, type VoicePort } from "../assistant/assistant-voice";
import { defaultDictationPreferences, type DictationPreferences } from "../voice-settings/dictation-preferences";
import {
  DICTATION_CLEANUP_TIMEOUT_MS, DictationProcessor, dictationCleanupParams, dictationPhraseLanguage, dictationRecognizerConfig, polishDictation,
} from "./dictation-processing";

const runId = "4f6b1c2e-8a3d-4e5f-9a1b-2c3d4e5f6a7b";
const preferences = (patch: Partial<DictationPreferences> = {}): DictationPreferences => ({ ...defaultDictationPreferences, ...patch });
const cleanupOn = (patch: Partial<DictationPreferences["dictationCleanup"]> = {}) =>
  preferences({ dictationCleanup: { ...defaultDictationPreferences.dictationCleanup, enabled: true, ...patch } });
function port(handler: (method: string, params: Record<string, unknown>) => Promise<unknown>) {
  const request = vi.fn((method: string, params: Record<string, unknown>) => handler(method, params));
  return { port: { current: () => true, request } as unknown as VoicePort, request };
}

// Mobile sent only the app language as a hint, so Whisper still guessed short Turkish phrases wrong.
it("forces the chosen language and the silence filter on the computer's recognizer, omitting Host defaults", () => {
  expect(dictationRecognizerConfig(preferences())).toEqual({});
  expect(dictationRecognizerConfig({ ...preferences({ dictationLanguage: "tr", dictationSilenceFilter: false }), whisperModel: "turbo" }))
    .toEqual({ whisperModel: "turbo", dictationLanguage: "tr", dictationSilenceFilter: false });
  // Automatic: the owner's language helps Whisper, but a cloud engine would translate into it.
  expect(dictationPhraseLanguage("auto", "tr-TR", false)).toBe("tr-TR");
  expect(dictationPhraseLanguage("auto", "tr-TR", true)).toBeUndefined();
  expect(dictationPhraseLanguage("de", "tr-TR", true)).toBe("de");
});

it("writes custom words and drops fillers in the recognized phrase only, like the desktop", () => {
  const words = preferences({ dictationDictionary: [{ term: "TypeScript", aliases: ["tayp skript"] }, { term: "Elsewhere", aliases: ["başka"], projectId: "p" }] });
  expect(polishDictation("tayp skript ile başka yazalım", words)).toBe("TypeScript ile başka yazalım");
  const fillers = preferences({ dictationRemoveFillers: true, dictationLanguage: "tr" });
  expect(polishDictation("Eee, bunu yarın hmm bitirelim.", fillers)).toBe("Bunu yarın bitirelim.");
  expect(polishDictation("Eee, bunu yarın bitirelim.", preferences())).toBe("Eee, bunu yarın bitirelim.");
});

it("sends only the phrase and the owner's cleanup settings to the computer, with a run id", async () => {
  expect(dictationCleanupParams(runId, "metin", { ...defaultDictationPreferences.dictationCleanup, enabled: true })).toEqual({ runId, text: "metin" });
  const { port: host, request } = port(async () => ({ text: "  Temiz metin. " }));
  const processor = new DictationProcessor({ preferences: () => cleanupOn({ model: "gpt-5", instructions: "Noktalama", correctionCue: "yok şöyle", translateToEnglish: true }), createId: () => runId });
  await expect(processor.process({ port: host, cleanupAvailable: true }, "temiz metin")).resolves.toBe("Temiz metin.");
  expect(request).toHaveBeenCalledWith("voice.dictation.process",
    { runId, text: "temiz metin", model: "gpt-5", instructions: "Noktalama", correctionCue: "yok şöyle", translateToEnglish: true },
    { retry: false, timeoutMs: DICTATION_CLEANUP_TIMEOUT_MS });
});

it("keeps the recognized text without asking a computer that cannot clean up or when cleanup fails", async () => {
  const { port: old, request: oldRequest } = port(async () => ({ text: "never" }));
  const processor = new DictationProcessor({ preferences: () => cleanupOn(), createId: () => runId });
  await expect(processor.process({ port: old, cleanupAvailable: false }, "ham metin")).resolves.toBe("ham metin");
  expect(oldRequest).not.toHaveBeenCalled();
  // A timeout may leave the run going on the computer, so it is cancelled; the phrase is still kept.
  const { port: failing, request } = port(async (method) => { if (method === "voice.dictation.process") throw new Error("timeout"); return {}; });
  await expect(processor.process({ port: failing, cleanupAvailable: true }, "ham metin")).resolves.toBe("ham metin");
  expect(request).toHaveBeenLastCalledWith("voice.dictation.cancel", { runId }, { retry: false, timeoutMs: 5000 });
  const { port: empty } = port(async () => ({ text: "   " }));
  await expect(processor.process({ port: empty, cleanupAvailable: true }, "ham metin")).resolves.toBe("ham metin");
});

it("cancels a cleanup in flight when the recording is discarded and inserts nothing", async () => {
  let answer: (value: unknown) => void = () => {};
  const { port: host, request } = port(method => method === "voice.dictation.process" ? new Promise(resolve => { answer = resolve; }) : Promise.resolve({}));
  const processor = new DictationProcessor({ preferences: () => cleanupOn(), createId: async () => runId });
  const pending = processor.process({ port: host, cleanupAvailable: true }, "ham metin");
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  processor.cancel();
  expect(request).toHaveBeenLastCalledWith("voice.dictation.cancel", { runId }, { retry: false, timeoutMs: 5000 });
  answer({ text: "late" });
  await expect(pending).resolves.toBeNull();
  // The next recording is processed normally.
  const { port: next } = port(async () => ({ text: "yeni" }));
  await expect(processor.process({ port: next, cleanupAvailable: true }, "x")).resolves.toBe("yeni");
});

it("starts dictation with its recognizer settings and sends a chosen language to cloud transcription only", async () => {
  const setup = (engine: "local" | "openai") => {
    let buffer: (data: Int16Array, rate: number) => void = () => {};
    const request = vi.fn(async (method: string): Promise<unknown> => method === "voice.local.start" ? { lease: "lease" } : { text: "merhaba" });
    const voice = new AssistantVoice({
      capture: async onBuffer => { buffer = onBuffer; return { start: async () => {}, stop: () => {} }; },
      play: async () => {}, stopPlayback: () => {}, state: () => {}, transcript: () => {}, error: () => {},
      engine: () => engine, language: () => "tr-TR", cloudLanguage: () => "tr",
      recognition: () => ({ dictationLanguage: "tr", dictationSilenceFilter: false }),
    });
    return { voice, request, port: { current: () => true, request } as unknown as VoicePort, buffer: () => buffer(new Int16Array(4800).fill(900), 16000) };
  };
  const target = { machineId: "m", environmentId: "e", threadId: "t" };
  const local = setup("local");
  await local.voice.record(local.port, target);
  local.buffer();
  await local.voice.finish();
  expect(local.request).toHaveBeenCalledWith("voice.local.start", { config: { dictationLanguage: "tr", dictationSilenceFilter: false, natural: false }, recognitionOnly: true }, expect.anything());
  expect(local.request).toHaveBeenCalledWith("voice.local.transcribe", expect.objectContaining({ language: "tr" }), expect.anything());
  // A call's natural start keeps its own speech configuration.
  const call = setup("local");
  await call.voice.record(call.port, target, { natural: true, endOnSilence: true });
  expect(call.request).toHaveBeenCalledWith("voice.local.start", { config: { natural: true }, recognitionOnly: true }, expect.anything());
  call.voice.cancel();
  const cloud = setup("openai");
  await cloud.voice.record(cloud.port, target);
  cloud.buffer();
  await cloud.voice.finish();
  expect(cloud.request).toHaveBeenCalledWith("voice.cloud.transcribe", expect.objectContaining({ provider: "openai", language: "tr" }), expect.anything());
});
