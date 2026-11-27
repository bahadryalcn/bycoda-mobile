import { create } from "zustand";
import type { AssistantThread } from "../../../../src/shared/model/host-contracts/assistant";
import { AssistantVoice, type AssistantVoiceState, type AssistantVoiceTarget, type VoicePort } from "./assistant-voice";
import { DraftStore } from "../workspace/draft-store";
import { createLevelSignal, type LiveText } from "../workspace/dictation-level";
import { computerDictationDependencies, computerLanguage, dictationEngineKind, loadDictationRecorder, type DictationRecorder } from "../workspace/dictation-engine";
import { DICTATION_CLEANUP_CAPABILITY, DictationProcessor, type DictationProcessContext } from "../workspace/dictation-processing";
import { voicePreferences } from "../voice-settings/voice-preferences";
import { decodePendingSpeech, pendingSpeechKey, type PendingSpeech } from "./assistant-speech-draft";
import { useAssistantCall } from "./assistant-call-state";

type CompanionState = {
  mode: "closed" | "full" | "minimized";
  surface: "chat" | "voice";
  machineId: string;
  environmentId: string;
  thread: AssistantThread | null;
  projectId: string;
  voice: AssistantVoiceState;
  voiceTarget?: AssistantVoiceTarget;
  transcript?: PendingSpeech;
  speechHydrated: boolean;
  error?: unknown;
  /** What the phone's own recognizer has heard so far while dictating on the phone; empty otherwise. */
  dictationPartial?: string;
  /** The assistant's profile name from the computer, for the floating window's title. */
  name?: string;
};
const initial: CompanionState = { mode: "closed", surface: "chat", machineId: "", environmentId: "", thread: null, projectId: "", voice: "idle", speechHydrated: false };
export const useAssistantCompanion = create<CompanionState>(() => initial);
/** Microphone level of the assistant composer's dictation; only its meter reads it. */
export const assistantDictationLevel = createLevelSignal();
/** `dictationPartial` for the composer's preview: a store update re-renders only views whose text changed. */
export const assistantDictationPartial: LiveText = {
  get: () => useAssistantCompanion.getState().dictationPartial ?? "",
  subscribe: listener => useAssistantCompanion.subscribe(() => listener()),
};
let engine: AssistantVoice | undefined;
let loading: Promise<AssistantVoice> | undefined;
/** Dictation on the phone's own recognizer (Settings → Voice assistant → Transcription); read-aloud stays on `engine`. */
let phoneRecorder: DictationRecorder | undefined;
let phoneLoading: Promise<DictationRecorder> | undefined;
let dictating: "phone" | "computer" = "computer";
let generation = 0;
let speechSequence = 0;
/** Custom words, filler removal and the optional cleanup on the computer, as in every composer. */
const processor = new DictationProcessor({
  preferences: () => voicePreferences.getState().preferences,
  createId: async () => (await import("expo-crypto")).randomUUID(),
  spokenLanguage: async () => (await computerLanguage())(),
});
/** The computer the current recording goes to, captured when it starts. */
let processing: DictationProcessContext | undefined;
/** Polishes recognized speech before it is kept for the assistant draft; a discarded recording keeps nothing. */
async function keepRecognizedSpeech(target: AssistantVoiceTarget, text: string) {
  const processed = processing ? await processor.process(processing, text) : text;
  if (processed !== null) await retainAssistantSpeech(target, processed);
}
let speechStore: Promise<DraftStore<PendingSpeech>> | undefined;
async function pendingSpeechStore(): Promise<DraftStore<PendingSpeech>> {
  if (!speechStore) speechStore = import("@react-native-async-storage/async-storage").then(async ({ default: storage }) => {
    const store = new DraftStore(storage, pendingSpeechKey, decodePendingSpeech, value => value ? JSON.stringify(value) : null);
    const transcript = await store.load();
    useAssistantCompanion.setState({ transcript: transcript ?? undefined, speechHydrated: true });
    return store;
  }).catch(error => { speechStore = undefined; useAssistantCompanion.setState({ error }); throw error; });
  const store = await speechStore;
  if (store.retired) { speechStore = undefined; return pendingSpeechStore(); }
  return store;
}
export async function hydrateAssistantSpeech() { await pendingSpeechStore(); }
export async function retainAssistantSpeech(target: AssistantVoiceTarget, text: string) {
  const store = await pendingSpeechStore();
  if (useAssistantCompanion.getState().transcript) throw new Error("A recognized speech draft is awaiting recovery.");
  const speech = { id: `${Date.now()}-${generation}-${++speechSequence}`, target: { ...target }, text };
  useAssistantCompanion.setState({ transcript: speech });
  await store.persist(speech);
  return speech;
}
export async function consumeAssistantSpeech(speech: PendingSpeech) {
  const store = await pendingSpeechStore();
  if (useAssistantCompanion.getState().transcript?.id !== speech.id) return;
  await store.persist(null);
  if (useAssistantCompanion.getState().transcript?.id === speech.id) useAssistantCompanion.setState({ transcript: undefined });
}
let voicePort: { machineId: string; environmentId: string; port: VoicePort } | undefined;

/** The app shell, never a disposable screen route, owns this transport and connection epoch. */
export function bindAssistantVoicePort(source: NonNullable<typeof voicePort>) {
  voicePort = source;
  return () => { if (voicePort === source) { voicePort = undefined; interruptAssistantVoice("Voice stopped because the computer connection changed. Check the connection and try again."); } };
}
function capturedVoicePort(target: AssistantVoiceTarget, allowed: () => boolean): VoicePort {
  if (useAssistantCall.getState().phase !== "idle") throw new Error("End the voice call before starting dictation or read aloud.");
  const source = voicePort;
  if (!source || source.machineId !== target.machineId || source.environmentId !== target.environmentId || !source.port.current() || !allowed())
    throw new Error("The assistant computer connection is unavailable.");
  return { current: () => useAssistantCall.getState().phase === "idle" && source.port.current() && allowed(), request: (method, params, options) => source.port.request(method, params, options) };
}

export function openAssistantCompanion(machineId: string, environmentId: string) {
  const state = useAssistantCompanion.getState();
  if (state.machineId !== machineId || state.environmentId !== environmentId) {
    closeAssistantCompanion();
    useAssistantCompanion.setState({ ...initial, transcript: state.transcript, speechHydrated: state.speechHydrated, machineId, environmentId, mode: "full" });
  } else useAssistantCompanion.setState({ mode: "full" });
}
export function minimizeAssistantCompanion() { useAssistantCompanion.setState({ mode: "minimized" }); }
export function closeAssistantCompanion() {
  const { transcript, speechHydrated } = useAssistantCompanion.getState();
  generation++; engine?.cancel(); phoneRecorder?.cancel(); processor.cancel();
  // Closing chrome must not discard recognized speech awaiting its original draft.
  useAssistantCompanion.setState({ ...initial, transcript, speechHydrated }, true);
}
export function cancelAssistantVoice() { generation++; engine?.cancel(); phoneRecorder?.cancel(); processor.cancel(); }
/**
 * Cancels dictation or read-aloud and resolves once the Host released their lease, also one still
 * starting. A call waits for it so its reply voice never meets this phone's own dictation lease.
 */
export async function settleAssistantVoice() { generation++; phoneRecorder?.cancel(); processor.cancel(); await engine?.cancelAndSettle(); }
/** Native permission windows can take focus; cancellation stays explicit and never auto-resumes. */
export function interruptAssistantVoice(message = "Voice stopped because the app lost focus. Return to Bycoda and try again.") {
  const active = useAssistantCompanion.getState().voice !== "idle";
  cancelAssistantVoice();
  if (active) useAssistantCompanion.setState({ voice: "idle", error: new Error(message) });
}
export function finishAssistantVoice() { return dictating === "phone" ? phoneRecorder?.finish() : engine?.finish(); }
async function phoneDictation() {
  phoneLoading ??= loadDictationRecorder("phone", {
    state: (voice, voiceTarget) => useAssistantCompanion.setState({ voice, voiceTarget }),
    transcript: keepRecognizedSpeech,
    error: error => useAssistantCompanion.setState({ error }),
    level: value => assistantDictationLevel.set(value),
    partial: text => useAssistantCompanion.setState({ dictationPartial: text }),
  }).then(recorder => { phoneRecorder = recorder; return recorder; }).catch(error => { phoneLoading = undefined; throw error; });
  return phoneLoading;
}
async function voiceEngine() {
  if (!loading) loading = Promise.all([import("./assistant-voice-native"), computerDictationDependencies()]).then(([{ nativeVoiceDependencies }, dictation]) => {
    engine = new AssistantVoice({ ...nativeVoiceDependencies({
      state: (voice, voiceTarget) => useAssistantCompanion.setState({ voice, voiceTarget }),
      transcript: keepRecognizedSpeech,
      error: error => useAssistantCompanion.setState({ error }),
      level: value => assistantDictationLevel.set(value),
    }), ...dictation });
    return engine;
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}
export async function recordAssistantVoice(target: AssistantVoiceTarget, allowed: () => boolean) {
  const version = generation;
  useAssistantCompanion.setState({ error: undefined });
  try {
    await pendingSpeechStore();
    if (useAssistantCompanion.getState().transcript) throw new Error("Return to the original assistant conversation to keep its recognized text before recording again.");
    const port = capturedVoicePort(target, allowed);
    await voicePreferences.getState().hydrate();
    const kind = dictationEngineKind(voicePreferences.getState().preferences);
    const voice: DictationRecorder = kind === "phone" ? await phoneDictation() : await voiceEngine();
    const cleanupAvailable = await import("@/state/machines")
      .then(({ useMachines }) => useMachines.getState().machines.find(machine => machine.id === target.machineId)?.capabilities?.includes(DICTATION_CLEANUP_CAPABILITY) === true)
      .catch(() => false);
    if (version === generation && port.current()) { dictating = kind; processing = { port, cleanupAvailable }; await voice.record(port, target); }
  }
  catch (error) { if (version === generation) useAssistantCompanion.setState({ error }); }
}
export async function speakAssistantReply(target: AssistantVoiceTarget, text: string, allowed: () => boolean) {
  const version = generation;
  useAssistantCompanion.setState({ error: undefined });
  try { const port = capturedVoicePort(target, allowed); const voice = await voiceEngine(); if (version === generation && port.current()) await voice.speak(port, target, text); }
  catch (error) { if (version === generation) useAssistantCompanion.setState({ error }); }
}
