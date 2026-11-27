import type { AssistantVoiceState, AssistantVoiceTarget, VoicePort } from "../assistant/assistant-voice";
import type { VoicePreferences } from "../voice-settings/voice-preferences";

/** What a dictation recorder reports to its owner (the composer hook or the assistant companion). */
export type DictationListeners = {
  state(phase: AssistantVoiceState, target?: AssistantVoiceTarget): void;
  /** The finished text, once per recording. */
  transcript(target: AssistantVoiceTarget, text: string): void | Promise<void>;
  error(error: unknown): void;
  /** Microphone level from 0 to 1 while recording, for the shared meter. */
  level?(value: number): void;
  /** Text recognized so far while recording; empty when the recording ends. Only the phone engine reports it. */
  partial?(text: string): void;
};

/** One tap-to-dictate recording: start, finish (keep the text) or cancel (drop it). */
export type DictationRecorder = {
  record(port: VoicePort, target: AssistantVoiceTarget): Promise<void>;
  finish(): Promise<void> | void;
  cancel(): void;
};

/**
 * Where dictation is recognized. `phone` is this phone's own speech recognizer (speech-to-text only);
 * `computer` is the engine chosen for the computer, which calls always use.
 */
export type DictationEngineKind = "phone" | "computer";
export function dictationEngineKind(preferences: Pick<VoicePreferences, "phoneDictation">): DictationEngineKind {
  return preferences.phoneDictation ? "phone" : "computer";
}

/**
 * The chosen dictation language (Settings → Voice and microphone), else the app's language (or the
 * phone's when the app follows the system), as a recognizer tag, read at each start.
 */
async function phoneLanguage() {
  const [{ getLocales }, { useMachines }, { resolveLocale }, { phoneDictationLanguage }, { voicePreferences }] = await Promise.all([
    import("expo-localization"), import("@/state/machines"), import("../../localization"), import("./phone-dictation"),
    import("../voice-settings/voice-preferences")]);
  return () => {
    const tags = getLocales().map(locale => locale.languageTag);
    const chosen = voicePreferences.getState().preferences.dictationLanguage;
    const language = useMachines.getState().language;
    return phoneDictationLanguage(chosen !== "auto" ? chosen : language === "system" ? resolveLocale(tags) : language, tags);
  };
}

/**
 * The language the owner most likely speaks: the chosen app language, or the phone's first language
 * when the app follows the system (also one the app itself is not translated into).
 */
export function spokenLanguage(appLanguage: string | undefined, deviceTags: readonly string[]): string | undefined {
  return appLanguage && appLanguage !== "system" ? appLanguage : deviceTags[0];
}

/** Reads the owner's language at each recording, for the computer's recognizer. */
export async function computerLanguage() {
  const [{ getLocales }, { useMachines }] = await Promise.all([import("expo-localization"), import("@/state/machines")]);
  return () => {
    try { return spokenLanguage(useMachines.getState().language, getLocales().map(locale => locale.languageTag)); }
    catch { return undefined; }
  };
}

/**
 * Dictation's settings for the computer's recognizer, read at each recording as on the desktop: the
 * chosen language (or the owner's as a hint for Whisper), the silence filter and the transcription model.
 * Calls never use these; they keep their own turn settings.
 */
export async function computerDictationDependencies() {
  const [owner, { voicePreferences }, { dictationPhraseLanguage, dictationRecognizerConfig }] = await Promise.all([
    computerLanguage(), import("../voice-settings/voice-preferences"), import("./dictation-processing")]);
  const preferences = () => voicePreferences.getState().preferences;
  return {
    language: () => dictationPhraseLanguage(preferences().dictationLanguage, owner(), false),
    cloudLanguage: () => dictationPhraseLanguage(preferences().dictationLanguage, owner(), true),
    recognition: () => dictationRecognizerConfig(preferences()),
  };
}

/**
 * Loads the recorder for `kind` lazily, so neither native audio stack is evaluated before the first
 * dictation. A build without the speech-recognition module asks the owner to update the app.
 */
export async function loadDictationRecorder(kind: DictationEngineKind, listeners: DictationListeners): Promise<DictationRecorder> {
  if (kind === "phone") {
    const [recognition, { PhoneDictation }, language] = await Promise.all([
      import("expo-speech-recognition").catch(() => null), import("./phone-dictation"), phoneLanguage()]);
    let recognizer;
    try { recognizer = recognition?.ExpoSpeechRecognitionModule; } catch { recognizer = undefined; }
    if (!recognizer) throw new Error("Update Bycoda to use the native voice companion.");
    return new PhoneDictation(recognizer, listeners, language);
  }
  const [{ AssistantVoice }, { nativeVoiceDependencies }, dictation] = await Promise.all([
    import("../assistant/assistant-voice"), import("../assistant/assistant-voice-native"), computerDictationDependencies()]);
  return new AssistantVoice({ ...nativeVoiceDependencies(listeners), ...dictation });
}
