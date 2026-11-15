import { create } from "zustand";
import type { AssistantThread } from "../../../../src/shared/model/host-contracts/assistant";
import { AssistantVoice, type AssistantVoiceState, type AssistantVoiceTarget, type VoicePort } from "./assistant-voice";
import { DraftStore } from "../workspace/draft-store";
import { decodePendingSpeech, pendingSpeechKey, type PendingSpeech } from "./assistant-speech-draft";
import { useAssistantCall } from "./assistant-call-state";

type CompanionState = {
  mode: "closed" | "full" | "minimized";
  machineId: string;
  environmentId: string;
  thread: AssistantThread | null;
  projectId: string;
  voice: AssistantVoiceState;
  voiceTarget?: AssistantVoiceTarget;
  transcript?: PendingSpeech;
  speechHydrated: boolean;
  error?: unknown;
};
const initial: CompanionState = { mode: "closed", machineId: "", environmentId: "", thread: null, projectId: "", voice: "idle", speechHydrated: false };
export const useAssistantCompanion = create<CompanionState>(() => initial);
let engine: AssistantVoice | undefined;
let loading: Promise<AssistantVoice> | undefined;
let generation = 0;
let speechSequence = 0;
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
  generation++; engine?.cancel();
  // Closing chrome must not discard recognized speech awaiting its original draft.
  useAssistantCompanion.setState({ ...initial, transcript, speechHydrated }, true);
}
export function cancelAssistantVoice() { generation++; engine?.cancel(); }
/** Native permission windows can take focus; cancellation stays explicit and never auto-resumes. */
export function interruptAssistantVoice(message = "Voice stopped because the app lost focus. Return to Bycoda and try again.") {
  const active = useAssistantCompanion.getState().voice !== "idle";
  cancelAssistantVoice();
  if (active) useAssistantCompanion.setState({ voice: "idle", error: new Error(message) });
}
export function finishAssistantVoice() { return engine?.finish(); }
async function voiceEngine() {
  if (!loading) loading = import("./assistant-voice-native").then(({ nativeVoiceDependencies }) => {
    engine = new AssistantVoice(nativeVoiceDependencies({
      state: (voice, voiceTarget) => useAssistantCompanion.setState({ voice, voiceTarget }),
      transcript: async (target, text) => { await retainAssistantSpeech(target, text); },
      error: error => useAssistantCompanion.setState({ error }),
    }));
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
    const port = capturedVoicePort(target, allowed); const voice = await voiceEngine(); if (version === generation && port.current()) await voice.record(port, target);
  }
  catch (error) { if (version === generation) useAssistantCompanion.setState({ error }); }
}
export async function speakAssistantReply(target: AssistantVoiceTarget, text: string, allowed: () => boolean) {
  const version = generation;
  useAssistantCompanion.setState({ error: undefined });
  try { const port = capturedVoicePort(target, allowed); const voice = await voiceEngine(); if (version === generation && port.current()) await voice.speak(port, target, text); }
  catch (error) { if (version === generation) useAssistantCompanion.setState({ error }); }
}
