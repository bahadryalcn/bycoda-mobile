import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { requireMicrophonePermission } from "../permissions/microphone-permission";
import { nativeVoiceCompanion, type NativeVoiceCompanion } from "../../../modules/bycoda-voice-companion";
import { openAssistantVoiceRuntime } from "@/state/host-runtime";
import { useMachines } from "@/state/machines";
import { useSecurity, isAppAccessAllowed } from "@/state/security";
import { hasProviderPermission, useProviderPermission } from "../privacy/consent-access";
import { isAccountAccessAllowed, useAccountAccess } from "../account/model/account-access";
import { reviewedMachine, isReviewedMachine } from "@/state/reviewed-machine";
import { AssistantVoice, type AssistantVoiceTarget, type VoicePort } from "./assistant-voice";
import { nativeVoiceDependencies } from "./assistant-voice-native";
import { AssistantMobileClient } from "./assistant-client";
import { AssistantCallLoop } from "./assistant-call-loop";
import { assistantSendKey, readStoredSend, sendRoomMessage, isAssistantSendPending } from "./assistant-send";
import { assistantMessageVisible } from "./assistant-history";
import { useAssistantCall } from "./assistant-call-state";
import { useAssistantCompanion, retainAssistantSpeech } from "./assistant-companion-state";

type ActiveCall = { id: string; native: NativeVoiceCompanion; loop: AssistantCallLoop; engine: AssistantVoice; release(): void };
let active: ActiveCall | undefined;
let cancelStartingCall: (() => void) | undefined;
let generation = 0;

export function assistantCallInBackground() {
  const state = useAssistantCall.getState();
  return !!active && state.phase !== "idle" && active.native.getState().sessionId === active.id && active.native.getState().active;
}
export function endAssistantCall() {
  generation++;
  const cancelStarting = cancelStartingCall; cancelStartingCall = undefined;
  const call = active; active = undefined;
  useAssistantCall.setState({ phase: "idle", muted: false, speakerMuted: false, level: 0, sessionId: undefined, lastReply: undefined, utterance: undefined, target: undefined, thread: undefined });
  cancelStarting?.();
  if (!call) return;
  try { call.release(); } finally { call.native.endSession(call.id); }
}
export function muteAssistantCall(muted: boolean) {
  if (!active) return;
  useAssistantCall.setState({ muted, level: 0 });
  active.native.setMuted(active.id, muted); active.loop.setMuted(muted);
}
/** Desktop "Silence": stop the reply being spoken and listen again. */
export function silenceAssistantCall() {
  return !!active && active.loop.interrupt();
}
export function setAssistantCallSpeakerMuted(speakerMuted: boolean) {
  if (!active) return;
  useAssistantCall.setState({ speakerMuted });
  active.loop.setSpeakerMuted(speakerMuted);
}
/** Desktop "Finish turn": send what was heard so far instead of waiting for silence. */
export function finishAssistantCallTurn() {
  if (!active || useAssistantCall.getState().phase !== "listening" || useAssistantCall.getState().muted) return;
  void active.engine.finish().catch(() => { /* The capture promise owns the reported failure. */ });
}
export async function pictureInPictureAssistant() {
  if (!active) return false;
  return active.native.enterPip(active.id);
}

/** Explicit Call grants only a native, fixed-thread voice socket, never background UI access. */
export async function startAssistantCall(target: AssistantVoiceTarget, allowed: () => boolean) {
  if (active || useAssistantCall.getState().phase === "starting") return;
  target = { ...target };
  const version = ++generation;
  const machines = useMachines.getState(), machine = machines.machines.find(row => row.id === target.machineId);
  const review = reviewedMachine(machine);
  const selectedThread = useAssistantCompanion.getState().thread;
  const projectId = selectedThread?.id === target.threadId ? selectedThread.projectId : undefined;
  const key = assistantSendKey(target.machineId, target.environmentId, target.threadId);
  useAssistantCall.setState({ phase: "starting", target: { ...target }, error: undefined, lastReply: undefined });
  let native: NativeVoiceCompanion | null = null, id: string | undefined;
  let retired = false;
  const cleanups: (() => void)[] = [];
  const release = () => {
    retired = true;
    // Each resource becomes owned before the next await or subscription can fail.
    for (const cleanup of cleanups.splice(0).reverse()) { try { cleanup(); } catch { /* Continue releasing the remaining native resources. */ } }
  };
  const cancelStarting = () => { release(); if (id) native?.endSession(id); };
  cancelStartingCall = cancelStarting;
  try {
    if (!machine || machine.environmentId !== target.environmentId || !allowed() || !isAppAccessAllowed() || useSecurity.getState().appState !== "active")
      throw new Error("Open and unlock this assistant conversation before starting a call.");
    if (selectedThread?.id !== target.threadId || isAssistantSendPending(key)) throw new Error("Wait for the current conversation message before starting a call.");
    native = nativeVoiceCompanion();
    if (!native) throw new Error("Voice calls require a native Bycoda build with background voice support.");
    await requireMicrophonePermission();
    if (version !== generation || !allowed() || !isReviewedMachine(review, useMachines.getState()) || !isAppAccessAllowed()) throw new Error("The assistant connection changed.");
    id = await native.beginSession();
    // Starting needs the unlocked, visible app. A started call is the owner's explicit, fixed-thread
    // voice line: like a phone call it continues in the background and behind the app lock, and it
    // ends on sign-out, consent withdrawal, a changed computer, the notification Stop or End.
    const current = () => {
      const state = useMachines.getState();
      const liveMachine = state.machines.find(row => row.id === target.machineId);
      return version === generation && !retired && isAccountAccessAllowed() && hasProviderPermission(liveMachine) &&
        isReviewedMachine(review, state) && native!.getState().active && native!.getState().sessionId === id;
    };
    const retire = () => { if (version === generation && !current()) { retired = true; endAssistantCall(); } };
    const port = await openAssistantVoiceRuntime(machine, { sessionId: id, threadId: target.threadId, projectId }, current);
    cleanups.push(() => port.release());
    if (!current()) throw new Error("The assistant connection changed.");
    if (isAssistantSendPending(key) || await readStoredSend(AsyncStorage, key)) throw new Error("Review the previous assistant message result before starting a call.");
    if (!current()) throw new Error("The assistant connection changed.");
    const client = new AssistantMobileClient({ environmentId: target.environmentId, current, request: (method, params, options) => port.request(method, params, { ...options, timeoutMs: 120000 }) });
    const access = async (required: readonly string[]) => {
      if (!required.length) return { ready: false, visible: () => false };
      const directory = await port.request<{ privacyReady: boolean; projects: { id: string; registered?: boolean }[] }>("projects.directory", {}, { timeoutMs: 15000 });
      if (!current() || !directory?.privacyReady || !Array.isArray(directory.projects)) throw new Error("Project access must be verified on your computer before continuing this call.");
      const ids = new Set(directory.projects.filter(row => row.registered).map(row => row.id));
      if (projectId && !ids.has(projectId)) throw new Error("The assistant project is no longer available.");
      return { ready: true, visible: (project: string) => ids.has(project) };
    };
    let pending: { resolve(text: string): void; reject(error: unknown): void; text?: string } | undefined;
    let audioError: unknown;
    let lastUtterance = "", needsRecovery = false;
    const engine = new AssistantVoice(nativeVoiceDependencies({
      level: level => {
        if (!retired && version === generation && useAssistantCall.getState().phase === "listening" && !useAssistantCall.getState().muted)
          useAssistantCall.setState({ level });
      },
      state: phase => {
        if (phase === "idle" && pending) {
          const done = pending;
          // Voice cancellation emits idle before its same-turn error callback.
          queueMicrotask(() => { if (pending === done) { pending = undefined; done.resolve(done.text ?? ""); } });
        }
      },
      transcript: (_target, text) => { if (pending) pending.text = text; },
      error: error => { audioError = error; const failed = pending; pending = undefined; failed?.reject(error); },
    }));
    cleanups.push(() => engine.cancel());
    const loop = new AssistantCallLoop({
      current,
      capture: (_target, valid) => new Promise<string>((resolve, reject) => {
        if (!valid()) { reject(new Error("Call stopped.")); return; }
        pending = { resolve, reject }; audioError = undefined;
        void engine.record({ current: () => current() && valid(), request: port.request.bind(port) } as VoicePort, target, { endOnSilence: true }).catch(reject);
      }),
      send: async text => {
        useAssistantCall.setState({ utterance: text });
        lastUtterance = text; needsRecovery = true;
        await access(projectId ? [projectId] : []);
        const result = await sendRoomMessage({ client, storage: AsyncStorage, storageKey: key, threadId: target.threadId, text, createId: randomUUID });
        if (result.kind !== "settled") throw new Error("The message result is unknown. Review it in the conversation before speaking again.");
        needsRecovery = false;
        const replies = result.messages.filter(message => message.role === "assistant");
        const contributors = replies.flatMap(message => message.projectIds ?? ["unverified"]);
        const visibility = await access(contributors);
        if (!replies.length || replies.some(message => !assistantMessageVisible(message, visibility))) throw new Error("The reply cannot be read with the current project access.");
        const reply = replies.map(message => message.text).join("\n\n");
        if (!current()) throw new Error("Call stopped.");
        useAssistantCall.setState(state => ({ lastReply: reply, replyVersion: state.replyVersion + 1 }));
        return reply;
      },
      speak: async (text, _target, valid) => { audioError = undefined; await engine.speak({ current: () => current() && valid(), request: port.request.bind(port) } as VoicePort, target, text); if (audioError) throw audioError; },
      cancelAudio: () => { const stopped = pending; pending = undefined; stopped?.reject(new Error("Call stopped.")); engine.cancel(); },
      state: phase => {
        if (retired || version !== generation) return;
        useAssistantCall.setState({ phase, level: 0 });
        // Loop reports its error immediately after idle; preserve that feedback before teardown.
        if (phase === "idle") queueMicrotask(() => { if (active?.loop === loop) endAssistantCall(); });
      },
      error: error => {
        if (retired || version !== generation) return;
        useAssistantCall.setState({ error });
        if (needsRecovery && lastUtterance) void readStoredSend(AsyncStorage, key).then(record => {
          if (!record) return retainAssistantSpeech(target, lastUtterance);
        }).catch(() => {});
      },
    });
    cleanups.push(() => loop.stop());
    cleanups.push(useMachines.subscribe(retire));
    cleanups.push(useAccountAccess.subscribe(retire));
    cleanups.push(useProviderPermission.subscribe(retire));
    const events = native.addListener("onVoiceEvent", event => {
      if (retired || version !== generation || active?.id !== id || event.sessionId !== id) return;
      if (!native!.getState().active) { endAssistantCall(); return; }
      if (event.state && event.state.muted !== useAssistantCall.getState().muted) muteAssistantCall(event.state.muted);
    });
    cleanups.push(() => events.remove());
    if (!current()) throw new Error("The assistant connection changed.");
    if (cancelStartingCall === cancelStarting) cancelStartingCall = undefined;
    active = { id, native, loop, engine, release };
    useAssistantCall.setState({ sessionId: id, thread: { ...selectedThread } });
    if (!loop.start(target)) throw new Error("The voice call could not start.");
  } catch (error) {
    release(); if (id) native?.endSession(id);
    if (version === generation) { active = undefined; useAssistantCall.setState({ phase: "idle", sessionId: undefined, error }); }
  } finally {
    if (cancelStartingCall === cancelStarting) cancelStartingCall = undefined;
  }
}
