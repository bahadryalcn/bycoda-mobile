import { describe, expect, it, vi } from "vitest";
import { PhoneDictation, phoneDictationError, phoneDictationLanguage, PHONE_DICTATION_ERRORS, type PhoneRecognizer } from "./phone-dictation";
import { dictationEngineKind } from "./dictation-engine";
import { dictationBlock } from "./dictation-model";
import { MicrophonePermissionError } from "../assistant/assistant-voice";
import { systemPromptCovering } from "@/state/system-prompt";

vi.mock("expo-localization", () => ({ getLocales: () => [] }));
vi.mock("@/state/machines", () => ({ useMachines: { getState: () => ({ language: "system" }) } }));

type Listener = (event: never) => void;
function fakeRecognizer(options: { available?: boolean; granted?: boolean; canAskAgain?: boolean; onDevice?: boolean } = {}) {
  const listeners = new Map<string, Set<Listener>>();
  const emit = (event: string, payload: unknown = null) => { for (const listener of listeners.get(event) ?? []) listener(payload as never); };
  const recognizer = {
    start: vi.fn(() => emit("start")),
    stop: vi.fn(),
    abort: vi.fn(() => emit("end")),
    requestPermissionsAsync: vi.fn(async () => ({ granted: options.granted ?? true, canAskAgain: options.canAskAgain ?? true })),
    isRecognitionAvailable: () => options.available ?? true,
    supportsOnDeviceRecognition: () => options.onDevice ?? true,
    addListener: (event: string, listener: Listener) => {
      const set = listeners.get(event) ?? new Set();
      set.add(listener); listeners.set(event, set);
      return { remove: () => set.delete(listener) };
    },
  };
  return { recognizer: recognizer as unknown as PhoneRecognizer & typeof recognizer, emit, listening: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0) };
}
const target = { machineId: "m", environmentId: "e", threadId: "t" };
const port = { current: () => true, request: vi.fn() };
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function listeners() {
  return { state: vi.fn(), transcript: vi.fn(), error: vi.fn(), partial: vi.fn(), level: vi.fn() };
}

describe("phone dictation", () => {
  it("recognizes on the device in the app language, shows partial text and hands over the joined finals", async () => {
    const fake = fakeRecognizer();
    const events = listeners();
    const dictation = new PhoneDictation(fake.recognizer, events, () => "tr-TR");
    const recording = dictation.record(port, target);
    await flush();
    expect(fake.recognizer.start).toHaveBeenCalledWith(expect.objectContaining({ lang: "tr-TR", requiresOnDeviceRecognition: true, interimResults: true, continuous: true }));
    expect(events.state).toHaveBeenLastCalledWith("recording", target);
    fake.emit("result", { isFinal: false, results: [{ transcript: "merhaba" }] });
    expect(events.partial).toHaveBeenLastCalledWith("merhaba");
    fake.emit("result", { isFinal: true, results: [{ transcript: "Merhaba dünya." }] });
    fake.emit("result", { isFinal: false, results: [{ transcript: "nasılsın" }] });
    expect(events.partial).toHaveBeenLastCalledWith("Merhaba dünya. nasılsın");
    fake.emit("volumechange", { value: 4 });
    expect(events.level).toHaveBeenLastCalledWith(0.5);
    await dictation.finish();
    expect(events.state).toHaveBeenLastCalledWith("transcribing", target);
    fake.emit("result", { isFinal: true, results: [{ transcript: "Nasılsın?" }] });
    fake.emit("end");
    await recording;
    expect(events.transcript).toHaveBeenCalledExactlyOnceWith(target, "Merhaba dünya. Nasılsın?");
    expect(events.state).toHaveBeenLastCalledWith("idle", target);
    expect(events.partial).toHaveBeenLastCalledWith("");
    // The preview is cleared before the final text is handed over, so the words never show twice.
    expect(events.partial.mock.invocationCallOrder.at(-1)!).toBeLessThan(events.transcript.mock.invocationCallOrder[0]!);
    expect(fake.listening()).toBe(0);
    expect(events.error).not.toHaveBeenCalled();
  });

  it("keeps nothing after cancel and reports permanent permission denial for the Settings notice", async () => {
    const fake = fakeRecognizer();
    const events = listeners();
    const dictation = new PhoneDictation(fake.recognizer, events, () => "en-US");
    const recording = dictation.record(port, target);
    await flush();
    fake.emit("result", { isFinal: true, results: [{ transcript: "discard me" }] });
    dictation.cancel();
    await recording;
    expect(events.transcript).not.toHaveBeenCalled();
    expect(events.error).not.toHaveBeenCalled();

    const denied = listeners();
    await new PhoneDictation(fakeRecognizer({ granted: false, canAskAgain: false }).recognizer, denied, () => "en-US").record(port, target);
    expect(denied.error.mock.calls[0]![0]).toBeInstanceOf(MicrophonePermissionError);
    const unavailable = listeners();
    await new PhoneDictation(fakeRecognizer({ available: false }).recognizer, unavailable, () => "en-US").record(port, target);
    expect(unavailable.error).toHaveBeenCalledWith(new Error(PHONE_DICTATION_ERRORS.unavailable));
    expect(unavailable.state).toHaveBeenLastCalledWith("idle", target);
  });

  it("reports silence as nothing recognized and asks for recognition only when the phone can", async () => {
    const fake = fakeRecognizer({ onDevice: false });
    const events = listeners();
    const recording = new PhoneDictation(fake.recognizer, events, () => "de-DE").record(port, target);
    await flush();
    expect(fake.recognizer.start).toHaveBeenCalledWith(expect.objectContaining({ requiresOnDeviceRecognition: false }));
    fake.emit("error", { error: "no-speech", message: "" });
    fake.emit("end");
    await recording;
    expect(events.error).toHaveBeenCalledWith(new Error(PHONE_DICTATION_ERRORS.nothing));
    expect(phoneDictationError({ error: "aborted" })).toBeNull();
    expect(phoneDictationError({ error: "language-not-supported" })?.message).toBe(PHONE_DICTATION_ERRORS.language);
  });

  it("uses the phone's region for the app language", () => {
    expect(phoneDictationLanguage("tr", ["tr-TR", "en-US"])).toBe("tr-TR");
    expect(phoneDictationLanguage("en", ["tr-TR", "en-GB"])).toBe("en-GB");
    expect(phoneDictationLanguage("pt", ["tr-TR"])).toBe("pt-BR");
    expect(phoneDictationLanguage("zh-CN", ["zh-TW"])).toBe("zh-CN");
  });

  it("is chosen only by the phone dictation preference and needs no Host voice capability", () => {
    expect(dictationEngineKind({ phoneDictation: true })).toBe("phone");
    expect(dictationEngineKind({ phoneDictation: false })).toBe("computer");
    expect(dictationBlock({ connected: true, capabilities: [], engine: "local", phone: true, otherVoiceActive: false })).toBeNull();
    expect(dictationBlock({ connected: true, capabilities: [], engine: "local", otherVoiceActive: false })).toBe("update");
    expect(dictationBlock({ connected: false, capabilities: [], engine: "local", phone: true, otherVoiceActive: false })).toBe("no-computer");
  });
  it("asks for permission only when not granted, as an app-initiated prompt so iOS 'inactive' does not stop it", async () => {
    const asked = fakeRecognizer();
    let coveredDuringPrompt = false;
    asked.recognizer.requestPermissionsAsync.mockImplementation(async () => { coveredDuringPrompt = systemPromptCovering(); return { granted: true, canAskAgain: true }; });
    const events = listeners();
    const first = new PhoneDictation(asked.recognizer, events, () => "en-US");
    const recording = first.record(port, target);
    await flush();
    expect(coveredDuringPrompt).toBe(true);
    first.cancel();
    await recording;

    const granted = fakeRecognizer();
    const read = vi.fn(async () => ({ granted: true, canAskAgain: true }));
    const recognizer = Object.assign(granted.recognizer, { getPermissionsAsync: read });
    const second = new PhoneDictation(recognizer, listeners(), () => "en-US");
    const again = second.record(port, target);
    await flush();
    expect(read).toHaveBeenCalledOnce();
    expect(granted.recognizer.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(granted.recognizer.start).toHaveBeenCalled();
    second.cancel();
    await again;
  });
});
