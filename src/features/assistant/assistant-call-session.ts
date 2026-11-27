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
import { nativeRealtimeAudio, nativeVoiceDependencies } from "./assistant-voice-native";
import { resolveLocale } from "../../localization";
import { selectedCloudModel, speechConfig, voicePreferences } from "../voice-settings/voice-preferences";
import { AssistantMobileClient } from "./assistant-client";
import { AssistantCallLoop, type AssistantCallTurnOrigin } from "./assistant-call-loop";
import { AssistantRealtimeCall, realtimeCallProvider, type RealtimeCallPort } from "./assistant-realtime-call";
import { VOICE_REALTIME_RELAY_V2_CAPABILITY } from "../../../../src/shared/model/host-contracts/voice";
import { HostWsError } from "@/remote/ws-connection";
import { AssistantCallError, assistantCallLinkDropped, assistantCallSleeps, assistantReplyOverdue, companionEndFailure } from "./assistant-call-error";
import { assistantSendKey, checkRoomMessage, readStoredSend, sendRoomMessage, isAssistantSendPending, type SendOutcome } from "./assistant-send";
import { assistantMessageVisible } from "./assistant-history";
import { callLevel, useAssistantCall } from "./assistant-call-state";
import type { AssistantVoiceStage } from "./assistant-voice-presentation";
import { useAssistantCompanion, retainAssistantSpeech, settleAssistantVoice } from "./assistant-companion-state";

/** The on-computer call loop, or the realtime voice the computer relays; both take the same controls. */
type CallLoop = Pick<AssistantCallLoop, "start" | "stop" | "setMuted" | "interrupt" | "setSpeakerMuted" | "submit" | "queued">;
type ActiveCall = {
  id: string; native: NativeVoiceCompanion; loop: CallLoop; engine?: AssistantVoice; release(): void;
  /** Publishes whether a typed message waits or is being sent. */
  syncTyped(): void;
  /** The typed message in flight was admitted, even if its reply then failed or the call ended. */
  typedDelivered(): boolean;
};
let active: ActiveCall | undefined;
let cancelStartingCall: (() => void) | undefined;
let generation = 0;
/** Desktop reconnects a dropped voice line on its own; the phone retries for about two and a half minutes. */
export const ASSISTANT_RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 30000, 30000, 30000, 30000] as const;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
/**
 * The phone waits past the computer's own 150 s limit for a reply (ASSISTANT_REQUEST_RESPONSE_TIMEOUT_MS in the
 * Host contract, which mobile runtime code cannot import), so the computer, not a shorter phone timer, reports it overdue.
 */
export const ASSISTANT_REPLY_WAIT_MS = 155_000;
/** After an overdue reply, its receipt is read this often until the reply is ready... */
export const ASSISTANT_REPLY_POLL_MS = 4_000;
/** ...for at most this long; then the call stops and the conversation shows the result. */
export const ASSISTANT_REPLY_POLL_LIMIT_MS = 10 * 60_000;
/** Dictation's Host lease (also one still starting) is released before the call asks for a reply voice; never longer than this. */
const DICTATION_SETTLE_MS = 20_000;
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Reads the receipt of a send whose reply outlasted the wait until the computer settles it. The
 * assistant keeps working after the wait runs out; ending the call there lost a reply that came later.
 */
export async function awaitOverdueReply(check: () => Promise<SendOutcome>, current: () => boolean, options: { pollMs?: number; limitMs?: number; wait?: (ms: number) => Promise<void> } = {}): Promise<SendOutcome> {
  const pollMs = options.pollMs ?? ASSISTANT_REPLY_POLL_MS, wait = options.wait ?? pause;
  let remaining = options.limitMs ?? ASSISTANT_REPLY_POLL_LIMIT_MS;
  let cause: unknown;
  while (remaining > 0) {
    await wait(pollMs); remaining -= pollMs;
    if (!current()) throw new AssistantCallError("stopped");
    try {
      const outcome = await check();
      if (outcome.kind !== "unknown") return outcome;
    } catch (error) {
      // A slow receipt read is waited out like the reply; any other failure leaves the result unknown.
      if (!assistantReplyOverdue(error)) return { kind: "unknown", cause: error };
      cause = error;
    }
  }
  return { kind: "unknown", cause };
}
/** The app language the computer's realtime voice starts in, until it hears the owner's own. */
function callLanguage() {
  const language = useMachines.getState().language;
  return language && language !== "system" ? language : resolveLocale([Intl.DateTimeFormat().resolvedOptions().locale]);
}
type CallResume = { attempt: number; muted: boolean; speakerMuted: boolean; original: unknown };
function cancelReconnect() {
  clearTimeout(reconnectTimer); reconnectTimer = undefined;
}
/**
 * Reopens a call whose voice line dropped while nothing could have changed the computer. Mute and
 * speaker choices carry over; End, a changed computer or running out of attempts stops trying.
 */
function scheduleReconnect(target: AssistantVoiceTarget, allowed: () => boolean, resume: CallResume): boolean {
  const delay = ASSISTANT_RECONNECT_DELAYS_MS[resume.attempt - 1];
  if (delay === undefined) return false;
  cancelReconnect();
  useAssistantCall.setState({ reconnecting: resume.attempt, error: undefined, asleep: undefined });
  const timer = reconnectTimer = setTimeout(() => {
    if (reconnectTimer !== timer) return;
    reconnectTimer = undefined;
    if (useAssistantCall.getState().reconnecting !== resume.attempt) return;
    // The screen or connection that allowed the call is gone: report the original drop instead of a new reason.
    if (!allowed()) { useAssistantCall.setState({ reconnecting: undefined, error: resume.original }); return; }
    void startAssistantCall(target, allowed, resume);
  }, delay);
  return true;
}

export function assistantCallInBackground() {
  const state = useAssistantCall.getState();
  return !!active && state.phase !== "idle" && active.native.getState().sessionId === active.id && active.native.getState().active;
}
/** `keepReconnect` is for the call's own teardown after a dropped line; every owner End stops reconnecting. */
/**
 * An owner End (or leaving the call for chat) also clears the last failure, so it does not linger in the
 * chat header; `keepError` is for teardown right after the call reported why it stopped.
 */
export function endAssistantCall(options?: { keepReconnect?: boolean; keepError?: boolean }) {
  generation++;
  if (!options?.keepReconnect) { cancelReconnect(); useAssistantCall.setState({ reconnecting: undefined }); }
  if (!options?.keepReconnect && !options?.keepError) useAssistantCall.setState({ error: undefined });
  const cancelStarting = cancelStartingCall; cancelStartingCall = undefined;
  const call = active; active = undefined;
  useAssistantCall.setState({ phase: "idle", muted: false, speakerMuted: false, level: 0, sessionId: undefined, lastReply: undefined, utterance: undefined, target: undefined, thread: undefined, capture: undefined, replyDelayed: undefined, typed: undefined, spokenInterrupt: undefined, typingUnavailable: undefined });
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
  const engine = active?.engine;
  if (!engine || useAssistantCall.getState().phase !== "listening" || useAssistantCall.getState().muted) return;
  void engine.finish().catch(() => { /* The capture promise owns the reported failure. */ });
}
/**
 * Sends a message typed during the call to the call's own conversation as its next turn. It waits for a
 * reply being awaited or spoken, and a capture in progress ends first so spoken words keep their order;
 * the reply is then spoken like a voice turn. Resolves once the computer admitted it.
 */
export function sendAssistantCallText(text: string, target: AssistantVoiceTarget): Promise<void> {
  const call = active, state = useAssistantCall.getState(), owned = state.target;
  if (!call || state.phase === "idle" || state.phase === "starting" || !owned || owned.machineId !== target.machineId ||
    owned.environmentId !== target.environmentId || owned.threadId !== target.threadId)
    return Promise.reject(new AssistantCallError("stopped"));
  const sent = call.loop.submit(text).then(() => {}, (error: unknown) => {
    // Admitted is delivered: a reply that then failed, or a call that ended meanwhile, does not unsend it.
    if (call.typedDelivered()) return;
    throw error;
  });
  call.syncTyped();
  return sent.finally(() => { if (active === call) call.syncTyped(); });
}
export async function pictureInPictureAssistant() {
  if (!active) return false;
  return active.native.enterPip(active.id);
}

/** Explicit Call grants only a native, fixed-thread voice socket, never background UI access. */
export async function startAssistantCall(target: AssistantVoiceTarget, allowed: () => boolean, resume?: CallResume) {
  if (active || useAssistantCall.getState().phase === "starting") return;
  if (!resume) cancelReconnect();
  target = { ...target };
  const version = ++generation;
  const machines = useMachines.getState(), machine = machines.machines.find(row => row.id === target.machineId);
  const review = reviewedMachine(machine);
  const selectedThread = useAssistantCompanion.getState().thread;
  const projectId = selectedThread?.id === target.threadId ? selectedThread.projectId : undefined;
  const key = assistantSendKey(target.machineId, target.environmentId, target.threadId);
  useAssistantCall.setState({ phase: "starting", target: { ...target }, error: undefined, asleep: undefined, reconnecting: resume?.attempt, lastReply: undefined, stage: "connect", spokenInterrupt: undefined, typingUnavailable: undefined });
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
    // The call is live: it ends with the computer, account, consent or native session that allowed it.
    const activate = (loop: CallLoop, engine: AssistantVoice | undefined, syncTyped: () => void, typedDelivered: () => boolean) => {
      const companion = native!, sessionId = id!;
      cleanups.push(() => loop.stop());
      cleanups.push(useMachines.subscribe(retire));
      cleanups.push(useAccountAccess.subscribe(retire));
      cleanups.push(useProviderPermission.subscribe(retire));
      const events = companion.addListener("onVoiceEvent", event => {
        if (retired || version !== generation || active?.id !== sessionId || event.sessionId !== sessionId) return;
        // The service ended the whole session (not one capture): say why, under the step it stopped at.
        const ended = event.type === "ended" && !event.captureId ? companionEndFailure(event.reason) : undefined;
        if (ended) useAssistantCall.setState(ended === "idle-timeout" ? { asleep: true }
          : { error: new AssistantCallError(ended, event.error ? new Error(event.error) : undefined) });
        if (!companion.getState().active) { endAssistantCall({ keepError: !!ended }); return; }
        if (event.state && event.state.muted !== useAssistantCall.getState().muted) muteAssistantCall(event.state.muted);
      });
      cleanups.push(() => events.remove());
      if (!current()) throw new AssistantCallError("connection-changed");
      if (cancelStartingCall === cancelStarting) cancelStartingCall = undefined;
      active = { id: sessionId, native: companion, loop, engine, release, syncTyped, typedDelivered };
      useAssistantCall.setState({ sessionId, thread: { ...selectedThread } });
      if (!loop.start(target)) throw new AssistantCallError("not-started");
      if (resume) {
        useAssistantCall.setState({ reconnecting: undefined });
        if (resume.muted) muteAssistantCall(true);
        if (resume.speakerMuted) setAssistantCallSpeakerMuted(true);
        // A later drop of this reopened call starts its attempts afresh.
        resume = undefined;
      }
    };
    const reportLevel = (sample: number) => {
      // Each microphone batch reports a level; only a visible step change reaches the store and its screens.
      const level = callLevel(sample), call = useAssistantCall.getState();
      if (!retired && version === generation && call.phase === "listening" && !call.muted && call.level !== level)
        useAssistantCall.setState({ level });
    };
    // A computer relaying Grok Voice or OpenAI Realtime runs the conversation itself: the phone is only
    // microphone and speaker, and no local recognizer or voice is loaded.
    const relayed = await realtimeCallProvider(machine.capabilities, port);
    if (!current()) throw new AssistantCallError("connection-changed");
    if (relayed) {
      // The relay's lease, read from its own start reply: typed messages join the same call.
      let lease: string | undefined;
      const relayPort: RealtimeCallPort = {
        request: async <T,>(method: string, params: Record<string, unknown>, options: { retry: false; timeoutMs: number }) => {
          const result = await port.request<T>(method, params, options);
          const started = method === "voice.realtime.start" ? (result as { lease?: unknown } | undefined)?.lease : undefined;
          if (typeof started === "string") lease = started;
          return result;
        },
      };
      // Typed messages the computer queued behind the reply in flight; each resolves once the computer sends it.
      const waiting: { text: string; resolve(): void; reject(error: unknown): void }[] = [];
      let typedSending = 0, typedDelivered = false;
      const syncTyped = () => {
        if (version === generation && !retired) useAssistantCall.setState({ typed: typedSending ? "sending" : waiting.length ? "queued" : undefined });
      };
      // A v2 relay takes spoken interruption (`duplex`, `playedMs`) and typed turns; an older one rejects them.
      const relayV2 = !!machine.capabilities?.includes(VOICE_REALTIME_RELAY_V2_CAPABILITY);
      if (!relayV2 && version === generation) useAssistantCall.setState({ typingUnavailable: true });
      const call: AssistantRealtimeCall = new AssistantRealtimeCall({
        port: relayPort, audio: nativeRealtimeAudio(native), provider: relayed, language: callLanguage(), projectId, relayV2, current,
        level: reportLevel,
        spokenInterrupt: available => {
          if (!retired && version === generation) useAssistantCall.setState({ spokenInterrupt: available });
        },
        state: phase => {
          if (retired || version !== generation) return;
          useAssistantCall.setState({ phase, level: 0 });
          if (phase === "idle") queueMicrotask(() => { if (active?.loop === loop) endAssistantCall({ keepReconnect: true }); });
        },
        transcript: (role, text) => {
          if (retired || version !== generation) return;
          if (role === "user") {
            useAssistantCall.setState({ utterance: text });
            // The computer shows a typed message once it is sent as the next turn.
            const index = waiting.findIndex(typed => typed.text === text.trim());
            if (index >= 0) { waiting.splice(index, 1)[0]!.resolve(); syncTyped(); }
          } else useAssistantCall.setState(state => ({ lastReply: text, replyVersion: state.replyVersion + 1 }));
        },
        error: error => {
          if (retired || version !== generation) return;
          if (assistantCallSleeps(error)) { useAssistantCall.setState({ asleep: true, error: undefined }); return; }
          const { muted, speakerMuted, stage: failedAt } = useAssistantCall.getState();
          if (assistantCallLinkDropped(error, failedAt) &&
            scheduleReconnect(target, allowed, { attempt: (resume?.attempt ?? 0) + 1, muted, speakerMuted, original: error })) return;
          useAssistantCall.setState({ error });
        },
      });
      const loop: CallLoop = {
        start: value => call.start(value),
        stop: () => {
          call.stop();
          // Queued messages the computer never sent end with the call; their drafts stay.
          for (const typed of waiting.splice(0)) typed.reject(new AssistantCallError("stopped"));
          syncTyped();
        },
        setMuted: value => call.setMuted(value),
        interrupt: () => call.interrupt(),
        setSpeakerMuted: value => call.setSpeakerMuted(value),
        get queued() { return waiting.length; },
        /**
         * A typed message goes to the computer's realtime voice as the next turn: at once, or after the
         * reply in flight. It resolves once the computer sends it, and that reply is spoken like any other.
         */
        submit: async text => {
          const words = text.trim();
          if (!relayV2) throw new HostWsError("unsupported");
          const relayLease = lease;
          if (!relayLease || !call.target) throw new AssistantCallError("stopped");
          typedSending++; typedDelivered = false; syncTyped();
          let queued: boolean;
          try {
            const result = await relayPort.request<{ queued?: unknown }>("voice.realtime.text", { lease: relayLease, text: words }, { retry: false, timeoutMs: 10_000 });
            queued = result?.queued === true;
          } finally { typedSending--; syncTyped(); }
          if (queued) await new Promise<void>((resolve, reject) => { waiting.push({ text: words, resolve, reject }); syncTyped(); });
          typedDelivered = true;
          return "";
        },
      };
      activate(loop, undefined, syncTyped, () => typedDelivered);
      return;
    }
    await voicePreferences.getState().hydrate();
    let turnPreferences = voicePreferences.getState().preferences;
    let held: { lease: string; key: string } | undefined;
    const releaseLease = (lease: string) => port.request("voice.local.release", { lease }, { timeoutMs: 5000 });
    const prepareVoice = async (valid: () => boolean) => {
      const preferences = voicePreferences.getState().preferences;
      const config = speechConfig(preferences);
      const configKey = JSON.stringify(config);
      if (held?.key !== configKey) {
        if (held) {
          const previous = held;
          await releaseLease(previous.lease);
          if (held === previous) held = undefined;
        }
        if (!valid()) throw new AssistantCallError("stopped");
        const hold = await port.request<{ lease?: string }>("voice.local.start", { config }, { timeoutMs: 60000 });
        if (typeof hold?.lease !== "string" || !hold.lease) throw new Error("Invalid voice connection.");
        if (!valid()) {
          await releaseLease(hold.lease).catch(() => {});
          throw new AssistantCallError("stopped");
        }
        held = { lease: hold.lease, key: configKey };
      }
      turnPreferences = preferences;
    };
    const holdAlive = setInterval(() => {
      if (held) void port.request("voice.local.keepAlive", { lease: held.lease }, { timeoutMs: 5000 }).catch(() => {});
    }, 30000);
    cleanups.push(() => {
      clearInterval(holdAlive);
      if (held) void releaseLease(held.lease).catch(() => {});
      held = undefined;
    });
    // This phone's own dictation holds a recognition-only lease; older computers refused the call's reply
    // voice beside it. Its release (also of a lease still starting) finishes before the call asks.
    await Promise.race([settleAssistantVoice(), pause(DICTATION_SETTLE_MS)]);
    if (!current()) throw new AssistantCallError("connection-changed");
    await prepareVoice(current);
    if (!current()) throw new AssistantCallError("connection-changed");
    const client = new AssistantMobileClient({ environmentId: target.environmentId, current, request: (method, params, options) => port.request(method, params, { ...options, timeoutMs: ASSISTANT_REPLY_WAIT_MS }) });
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
    // A typed message asked the capture in progress to end; it ends as soon as recording has begun.
    let endTurn = false;
    let typedSending = false, typedDelivered = false;
    const syncTyped = () => {
      if (version === generation && !retired) useAssistantCall.setState({ typed: typedSending ? "sending" : loop.queued ? "queued" : undefined });
    };
    const engine = new AssistantVoice({ ...nativeVoiceDependencies({
      level: reportLevel,
      state: phase => {
        if (version === generation && !retired) useAssistantCall.setState({ capture: phase });
        if (phase === "recording" && endTurn) { endTurn = false; void engine.finish().catch(() => {}); }
        if (phase === "idle" && pending) {
          const done = pending;
          // Voice cancellation emits idle before its same-turn error callback.
          queueMicrotask(() => { if (pending === done) { pending = undefined; done.resolve(done.text ?? ""); } });
        }
      },
      transcript: (_target, text) => { if (pending) pending.text = text; },
      stage,
      error: error => { audioError = error; const failed = pending; pending = undefined; failed?.reject(error); },
    }), engine: () => turnPreferences.engine,
      cloudModel: () => selectedCloudModel(turnPreferences), speech: () => speechConfig(turnPreferences),
      // The computer's recognizer guesses short clips badly without the owner's language.
      language: callLanguage });
    cleanups.push(() => engine.cancel());
    const sendTurn = async (text: string, origin: AssistantCallTurnOrigin) => {
      useAssistantCall.setState({ utterance: text, stage: "reply", replyDelayed: undefined });
      // Typed words stay in the composer's own draft; only spoken words are kept for the owner after a failure.
      lastUtterance = origin === "spoken" ? text : ""; needsRecovery = true;
      await access(projectId ? [projectId] : []);
      let result = await sendRoomMessage({ client, storage: AsyncStorage, storageKey: key, threadId: target.threadId, text, createId: randomUUID });
      // The reply outlasted the wait while the line stayed up: keep waiting on its receipt instead of stopping.
      if (result.kind === "unknown" && assistantReplyOverdue(result.cause) && current()) {
        const overdue = result.cause;
        useAssistantCall.setState({ replyDelayed: true });
        try { result = await awaitOverdueReply(() => checkRoomMessage({ client, storage: AsyncStorage, storageKey: key }), current); }
        finally { if (version === generation && !retired) useAssistantCall.setState({ replyDelayed: undefined }); }
        if (result.kind === "unknown" && result.cause === undefined) result = { kind: "unknown", cause: overdue };
      }
      // Nothing was sent: the error handler keeps the words so the owner can speak or send them again.
      if (result.kind === "refused") throw new AssistantCallError("reply-refused");
      if (result.kind !== "settled") throw new AssistantCallError("result-unknown", result.cause);
      needsRecovery = false; if (origin === "typed") typedDelivered = true;
      const replies = result.messages.filter(message => message.role === "assistant");
      const contributors = replies.flatMap(message => message.projectIds ?? ["unverified"]);
      const visibility = await access(contributors);
      if (!replies.length || replies.some(message => !assistantMessageVisible(message, visibility))) throw new AssistantCallError("reply-hidden");
      const reply = replies.map(message => message.text).join("\n\n");
      if (!current()) throw new AssistantCallError("stopped");
      useAssistantCall.setState(state => ({ lastReply: reply, replyVersion: state.replyVersion + 1 }));
      return reply;
    };
    const loop = new AssistantCallLoop({
      current,
      capture: async (_target, valid) => {
        await prepareVoice(valid);
        return new Promise<string>((resolve, reject) => {
        if (!valid()) { reject(new AssistantCallError("stopped")); return; }
        // Silence returns to listening, so a later "no speech" stop belongs to the microphone, not transcription.
        pending = { resolve: text => { if (!text.trim()) stage("microphone"); resolve(text); }, reject }; audioError = undefined;
        void engine.record({ current: () => current() && valid(), request: port.request.bind(port) } as VoicePort, target, {
          endOnSilence: true, natural: true,
          turn: { endSilence: turnPreferences.turnPause, manualTurnEnd: turnPreferences.manualTurnEnd },
        }).catch(reject);
        }).finally(() => { endTurn = false; });
      },
      endCapture: () => {
        if (useAssistantCall.getState().capture !== "recording") { endTurn = true; return; }
        void engine.finish().catch(() => { /* The capture promise owns the reported failure. */ });
      },
      send: async (text, _target, _valid, origin) => {
        typedSending = origin === "typed"; typedDelivered = false; syncTyped();
        try { return await sendTurn(text, origin); } finally { typedSending = false; syncTyped(); }
      },
      speak: async (text, _target, valid) => {
        await prepareVoice(valid);
        audioError = undefined;
        await engine.speak({ current: () => current() && valid(), request: port.request.bind(port) } as VoicePort, target, text);
        if (audioError) throw audioError;
      },
      cancelAudio: () => { const stopped = pending; pending = undefined; stopped?.reject(new AssistantCallError("stopped")); engine.cancel(); },
      state: phase => {
        if (retired || version !== generation) return;
        useAssistantCall.setState({ phase, level: 0 });
        // Loop reports its error immediately after idle; preserve that feedback before teardown.
        if (phase === "idle") queueMicrotask(() => { if (active?.loop === loop) endAssistantCall({ keepReconnect: true }); });
      },
      error: error => {
        if (retired || version !== generation) return;
        // Three minutes without speech: the desktop sleeps ("Ready. Microphone is off.") instead of failing.
        if (assistantCallSleeps(error)) { useAssistantCall.setState({ asleep: true, error: undefined }); return; }
        const { muted, speakerMuted, stage: failedAt } = useAssistantCall.getState();
        if (!needsRecovery && assistantCallLinkDropped(error, failedAt) &&
          scheduleReconnect(target, allowed, { attempt: (resume?.attempt ?? 0) + 1, muted, speakerMuted, original: error })) return;
        useAssistantCall.setState({ error });
        if (needsRecovery && lastUtterance) void readStoredSend(AsyncStorage, key).then(record => {
          if (!record) return retainAssistantSpeech(target, lastUtterance);
        }).catch(() => {});
      },
    });
    activate(loop, engine, syncTyped, () => typedDelivered);
  } catch (error) {
    release(); if (id) native?.endSession(id);
    if (version === generation) {
      active = undefined;
      useAssistantCall.setState({ phase: "idle", sessionId: undefined });
      // A reopening call keeps trying while the computer is still unreachable; any other failure is reported.
      if (resume && assistantCallLinkDropped(error, "connect") &&
        scheduleReconnect(target, allowed, { ...resume, attempt: resume.attempt + 1 })) return;
      // A reopening that ran out of attempts, or could not run in the background, reports the original drop.
      const generic = assistantCallLinkDropped(error, "connect") ||
        (error instanceof AssistantCallError && (error.reason === "unlock" || error.reason === "connection-changed"));
      useAssistantCall.setState({ reconnecting: undefined, error: resume && generic ? resume.original : error });
    }
  } finally {
    if (cancelStartingCall === cancelStarting) cancelStartingCall = undefined;
  }
}
