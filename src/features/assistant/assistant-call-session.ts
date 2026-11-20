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
import { speechConfig, voicePreferences } from "../voice-settings/voice-preferences";
import { AssistantMobileClient } from "./assistant-client";
import { AssistantCallLoop } from "./assistant-call-loop";
import { AssistantCallError, companionEndFailure } from "./assistant-call-error";
import { assistantSendKey, readStoredSend, sendRoomMessage, isAssistantSendPending } from "./assistant-send";
import { assistantMessageVisible } from "./assistant-history";
import { useAssistantCall } from "./assistant-call-state";
import type { AssistantVoiceStage } from "./assistant-voice-presentation";
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
  useAssistantCall.setState({ phase: "idle", muted: false, speakerMuted: false, level: 0, sessionId: undefined, lastReply: undefined, utterance: undefined, target: undefined, thread: undefined, capture: undefined });
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
  useAssistantCall.setState({ phase: "starting", target: { ...target }, error: undefined, lastReply: undefined, stage: "connect" });
  const stage = (value: AssistantVoiceStage) => { if (version === generation && !retired) useAssistantCall.setState({ stage: value }); };
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
      throw new AssistantCallError("unlock");
    if (selectedThread?.id !== target.threadId || isAssistantSendPending(key)) throw new AssistantCallError("message-pending");
    native = nativeVoiceCompanion();
    if (!native) throw new AssistantCallError("native-unavailable");
    stage("microphone");
    await requireMicrophonePermission();
    stage("connect");
    if (version !== generation || !allowed() || !isReviewedMachine(review, useMachines.getState()) || !isAppAccessAllowed()) throw new AssistantCallError("connection-changed");
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
    if (!current()) throw new AssistantCallError("connection-changed");
    // Every turn opens and closes its own listening and speaking lease; with no lease left the Host unloads
    // Whisper and the voice, so each reply waited for both to load again. One speech lease held for the call
    // keeps them loaded until it ends.
    // An unreviewed message blocks the call; say so before waiting for the computer to load its voice.
    if (isAssistantSendPending(key) || await readStoredSend(AsyncStorage, key)) throw new AssistantCallError("send-unreviewed");
    // The lease uses the same voice as every turn, or the Host would see two configurations and refuse.
    await voicePreferences.getState().hydrate();
    const hold = await port.request<{ lease?: string }>("voice.local.start", { config: speechConfig(voicePreferences.getState().preferences) }, { timeoutMs: 60000 });
    if (typeof hold?.lease !== "string" || !hold.lease) throw new Error("Invalid voice connection.");
    const holdLease = hold.lease;
    const holdAlive = setInterval(() => { void port.request("voice.local.keepAlive", { lease: holdLease }, { timeoutMs: 5000 }).catch(() => {}); }, 30000);
    cleanups.push(() => { clearInterval(holdAlive); void port.request("voice.local.release", { lease: holdLease }, { timeoutMs: 5000 }).catch(() => {}); });
    if (!current()) throw new AssistantCallError("connection-changed");
    if (!current()) throw new AssistantCallError("connection-changed");
    const client = new AssistantMobileClient({ environmentId: target.environmentId, current, request: (method, params, options) => port.request(method, params, { ...options, timeoutMs: 120000 }) });
    const access = async (required: readonly string[]) => {
      if (!required.length) return { ready: false, visible: () => false };
      const directory = await port.request<{ privacyReady: boolean; projects: { id: string; registered?: boolean }[] }>("projects.directory", {}, { timeoutMs: 15000 });
      if (!current() || !directory?.privacyReady || !Array.isArray(directory.projects)) throw new AssistantCallError("project-unverified");
      const ids = new Set(directory.projects.filter(row => row.registered).map(row => row.id));
      if (projectId && !ids.has(projectId)) throw new AssistantCallError("project-unavailable");
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
        if (version === generation && !retired) useAssistantCall.setState({ capture: phase });
        if (phase === "idle" && pending) {
          const done = pending;
          // Voice cancellation emits idle before its same-turn error callback.
          queueMicrotask(() => { if (pending === done) { pending = undefined; done.resolve(done.text ?? ""); } });
        }
      },
      transcript: (_target, text) => { if (pending) pending.text = text; },
      stage,
      error: error => { audioError = error; const failed = pending; pending = undefined; failed?.reject(error); },
    }));
    cleanups.push(() => engine.cancel());
    const loop = new AssistantCallLoop({
      current,
      capture: (_target, valid) => new Promise<string>((resolve, reject) => {
        if (!valid()) { reject(new AssistantCallError("stopped")); return; }
        // Silence returns to listening, so a later "no speech" stop belongs to the microphone, not transcription.
        pending = { resolve: text => { if (!text.trim()) stage("microphone"); resolve(text); }, reject }; audioError = undefined;
        void engine.record({ current: () => current() && valid(), request: port.request.bind(port) } as VoicePort, target, { endOnSilence: true, natural: true }).catch(reject);
      }),
      send: async text => {
        useAssistantCall.setState({ utterance: text, stage: "reply" });
        lastUtterance = text; needsRecovery = true;
        await access(projectId ? [projectId] : []);
        const result = await sendRoomMessage({ client, storage: AsyncStorage, storageKey: key, threadId: target.threadId, text, createId: randomUUID });
        if (result.kind !== "settled") throw new AssistantCallError("result-unknown", result.kind === "unknown" ? result.cause : undefined);
        needsRecovery = false;
        const replies = result.messages.filter(message => message.role === "assistant");
        const contributors = replies.flatMap(message => message.projectIds ?? ["unverified"]);
        const visibility = await access(contributors);
        if (!replies.length || replies.some(message => !assistantMessageVisible(message, visibility))) throw new AssistantCallError("reply-hidden");
        const reply = replies.map(message => message.text).join("\n\n");
        if (!current()) throw new AssistantCallError("stopped");
        useAssistantCall.setState(state => ({ lastReply: reply, replyVersion: state.replyVersion + 1 }));
        return reply;
      },
      speak: async (text, _target, valid) => { audioError = undefined; await engine.speak({ current: () => current() && valid(), request: port.request.bind(port) } as VoicePort, target, text); if (audioError) throw audioError; },
      cancelAudio: () => { const stopped = pending; pending = undefined; stopped?.reject(new AssistantCallError("stopped")); engine.cancel(); },
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
      // The service ended the whole session (not one capture): say why, under the step it stopped at.
      const ended = event.type === "ended" && !event.captureId ? companionEndFailure(event.reason) : undefined;
      if (ended) useAssistantCall.setState({ error: new AssistantCallError(ended, event.error ? new Error(event.error) : undefined) });
      if (!native!.getState().active) { endAssistantCall(); return; }
      if (event.state && event.state.muted !== useAssistantCall.getState().muted) muteAssistantCall(event.state.muted);
    });
    cleanups.push(() => events.remove());
    if (!current()) throw new AssistantCallError("connection-changed");
    if (cancelStartingCall === cancelStarting) cancelStartingCall = undefined;
    active = { id, native, loop, engine, release };
    useAssistantCall.setState({ sessionId: id, thread: { ...selectedThread } });
    if (!loop.start(target)) throw new AssistantCallError("not-started");
  } catch (error) {
    release(); if (id) native?.endSession(id);
    if (version === generation) { active = undefined; useAssistantCall.setState({ phase: "idle", sessionId: undefined, error }); }
  } finally {
    if (cancelStartingCall === cancelStarting) cancelStartingCall = undefined;
  }
}
