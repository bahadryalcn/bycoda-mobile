import type { ExpoSpeechRecognitionNativeEventMap, ExpoSpeechRecognitionOptions } from "expo-speech-recognition";
import { MicrophonePermissionError, type AssistantVoiceState, type AssistantVoiceTarget, type VoicePort } from "../assistant/assistant-voice";
import type { DictationListeners, DictationRecorder } from "./dictation-engine";
import { requestDevicePermission, type DevicePermission } from "../permissions/permission-flow";

/** The same limit as dictation on the computer, so both engines behave alike. */
export const PHONE_DICTATION_MS = 30_000;

/** Errors the phone recognizer reports, as fixed English sentences the shared voice error presenter translates. */
export const PHONE_DICTATION_ERRORS = {
  unavailable: "Speech recognition is not available on this phone. Choose your computer in Voice assistant settings.",
  permission: "Speech recognition permission is required. Enable it in phone settings.",
  language: "This phone cannot recognize speech in this language. Choose your computer in Voice assistant settings.",
  network: "The phone's speech recognizer needs a network connection. Try again or choose your computer.",
  nothing: "Speech could not be recognized. Try again.",
} as const;

/** The part of `ExpoSpeechRecognitionModule` dictation uses; tests pass a fake. */
export type PhoneRecognizer = {
  start(options: ExpoSpeechRecognitionOptions): void;
  stop(): void;
  abort(): void;
  requestPermissionsAsync(): Promise<{ granted: boolean; canAskAgain?: boolean }>;
  /** Reads the current answer without asking; the module has it, a fake may not. */
  getPermissionsAsync?(): Promise<{ granted: boolean; canAskAgain?: boolean }>;
  isRecognitionAvailable(): boolean;
  supportsOnDeviceRecognition(): boolean;
  addListener<K extends keyof ExpoSpeechRecognitionNativeEventMap>(event: K, listener: (event: ExpoSpeechRecognitionNativeEventMap[K]) => void): { remove(): void };
};

/**
 * The recognition language for the app's locale. The phone's own regional tag is kept when it names the
 * same language (tr-TR, en-GB, pt-PT), otherwise a common region is assumed.
 */
export function phoneDictationLanguage(appLocale: string, deviceTags: readonly string[]): string {
  const language = appLocale.split("-")[0]!.toLowerCase();
  if (appLocale.includes("-")) return appLocale;
  const device = deviceTags.find(tag => tag.split("-")[0]!.toLowerCase() === language && tag.includes("-"));
  if (device) return device;
  const regions: Record<string, string> = { tr: "tr-TR", en: "en-US", de: "de-DE", fr: "fr-FR", es: "es-ES", pt: "pt-BR", ja: "ja-JP", zh: "zh-CN" };
  return regions[language] ?? appLocale;
}

/** A recognizer error event as the sentence the owner reads; `aborted` is our own cancel and is silent. */
export function phoneDictationError(event: { error: string; message?: string }): Error | MicrophonePermissionError | null {
  switch (event.error) {
    case "aborted": return null;
    case "not-allowed": return new Error(PHONE_DICTATION_ERRORS.permission);
    case "language-not-supported": return new Error(PHONE_DICTATION_ERRORS.language);
    case "network": return new Error(PHONE_DICTATION_ERRORS.network);
    case "no-speech": case "speech-timeout": return new Error(PHONE_DICTATION_ERRORS.nothing);
    case "service-not-allowed": return new Error(PHONE_DICTATION_ERRORS.unavailable);
    default: return new Error("Microphone recording stopped unexpectedly.");
  }
}

async function askPhonePermission(recognizer: PhoneRecognizer) {
  const asDevice = async (read: Promise<{ granted: boolean; canAskAgain?: boolean }>): Promise<DevicePermission> => {
    const answer = await read;
    return { granted: answer.granted, canAskAgain: answer.canAskAgain !== false, status: answer.granted ? "granted" : "denied" };
  };
  const read = recognizer.getPermissionsAsync?.bind(recognizer);
  const answered = await requestDevicePermission(
    () => read ? asDevice(read()) : Promise.resolve({ granted: false, canAskAgain: true, status: "undetermined" }),
    () => asDevice(recognizer.requestPermissionsAsync()),
    async () => {},
  );
  return answered;
}

/**
 * Dictation recognized by the phone's own speech recognizer (Apple Speech, Android SpeechRecognizer).
 * Speech-to-text only: nothing is sent to the computer and nothing is spoken. On-device recognition is
 * required whenever the phone supports it. Final segments are joined; partial text is reported as it
 * arrives so the composer can show it, and only the finished text is handed to `transcript`.
 */
export class PhoneDictation implements DictationRecorder {
  private phase: AssistantVoiceState = "idle";
  private epoch = 0;
  private subscriptions: { remove(): void }[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private committed = "";
  private pending = "";
  private target?: AssistantVoiceTarget;
  private failure: unknown = null;
  private settle?: () => void;

  constructor(private readonly recognizer: PhoneRecognizer, private readonly listeners: DictationListeners, private readonly language: () => string) {}

  private update(phase: AssistantVoiceState) { this.phase = phase; this.listeners.state(phase, this.target); }
  private cleanup() {
    clearTimeout(this.timer); this.timer = undefined;
    for (const subscription of this.subscriptions.splice(0)) subscription.remove();
    this.listeners.partial?.("");
    this.listeners.level?.(0);
  }
  private text() { return [this.committed, this.pending].map(part => part.trim()).filter(Boolean).join(" "); }

  async record(port: VoicePort, target: AssistantVoiceTarget) {
    if (this.phase !== "idle" || !port.current()) return;
    const epoch = ++this.epoch;
    this.target = { ...target };
    this.committed = ""; this.pending = ""; this.failure = null;
    this.update("preparing");
    try {
      if (!this.recognizer.isRecognitionAvailable()) throw new Error(PHONE_DICTATION_ERRORS.unavailable);
      // Asked only when not yet granted, and as an app-initiated system prompt: iOS reports the dialog
      // as "inactive", which must not read as leaving the app (it stopped the first dictation).
      const permission = await askPhonePermission(this.recognizer);
      if (epoch !== this.epoch) return;
      if (!permission.granted) {
        if (permission.canAskAgain === false) throw new MicrophonePermissionError();
        throw new Error("Microphone access was not granted. Tap the microphone to try again.");
      }
      if (!port.current()) throw new Error("Dictation stopped because the app lost focus. Return to bycoda and try again.");
      const ended = new Promise<void>(resolve => { this.settle = resolve; });
      this.subscriptions.push(
        this.recognizer.addListener("result", event => {
          if (epoch !== this.epoch) return;
          if (this.phase === "preparing") this.update("recording");
          const transcript = event.results[0]?.transcript ?? "";
          if (event.isFinal) { this.committed = [this.committed, transcript].map(part => part.trim()).filter(Boolean).join(" "); this.pending = ""; }
          else this.pending = transcript;
          this.listeners.partial?.(this.text());
        }),
        this.recognizer.addListener("error", event => {
          if (epoch !== this.epoch) return;
          const error = phoneDictationError(event);
          // No speech after something was already recognized is just the end of the recording.
          if (error && !(error.message === PHONE_DICTATION_ERRORS.nothing && this.text())) this.failure = error;
        }),
        this.recognizer.addListener("start", () => { if (epoch === this.epoch && this.phase === "preparing") this.update("recording"); }),
        this.recognizer.addListener("volumechange", event => {
          // The recognizer reports -2 (silence) to 10; the shared meter takes 0 to 1.
          if (epoch === this.epoch && this.phase === "recording") this.listeners.level?.(Math.min(1, Math.max(0, (event.value + 2) / 12)));
        }),
        this.recognizer.addListener("end", () => { if (epoch === this.epoch) this.settle?.(); }),
      );
      const onDevice = this.recognizer.supportsOnDeviceRecognition();
      this.recognizer.start({
        lang: this.language(), interimResults: true, continuous: true, maxAlternatives: 1, addsPunctuation: true,
        requiresOnDeviceRecognition: onDevice, iosTaskHint: "dictation",
        volumeChangeEventOptions: { enabled: !!this.listeners.level, intervalMillis: 100 },
      });
      this.timer = setTimeout(() => { if (epoch === this.epoch) void this.finish(); }, PHONE_DICTATION_MS);
      await ended;
      if (epoch !== this.epoch) return;
      this.cleanup();
      const text = this.text();
      if (this.failure && !text) throw this.failure;
      if (!text) throw new Error(PHONE_DICTATION_ERRORS.nothing);
      if (!port.current()) throw new Error("Dictation stopped because the app lost focus. Return to bycoda and try again.");
      this.update("transcribing");
      await this.listeners.transcript(this.target!, text);
      if (epoch === this.epoch) this.update("idle");
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.epoch++;
      this.cleanup();
      try { this.recognizer.abort(); } catch { /* the recognizer may not have started */ }
      this.update("idle");
      this.listeners.error(error);
    }
  }

  /** Stops listening; the recognizer delivers its final text and `record` hands it over. */
  async finish() {
    if (this.phase === "preparing") { this.cancel(); return; }
    if (this.phase !== "recording") return;
    clearTimeout(this.timer); this.timer = undefined;
    this.update("transcribing");
    try { this.recognizer.stop(); } catch { this.settle?.(); }
  }

  cancel() {
    this.epoch++;
    this.cleanup();
    if (this.phase !== "idle") { try { this.recognizer.abort(); } catch { /* already stopped */ } }
    this.settle?.(); this.settle = undefined;
    this.update("idle");
  }
}
