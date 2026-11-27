import { afterEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  machine: { id: "computer", environmentId: "env", providers: [] as string[], capabilities: [] as string[] }, id: 0, listeners: [] as any[], loops: [] as any[], retireHooks: [] as (() => void)[],
  release: vi.fn(), removeEvent: vi.fn(), unsubscribe: vi.fn(), read: vi.fn(async () => null as unknown),
  end: vi.fn(), request: vi.fn(async (method: string): Promise<unknown> => method === "voice.local.start" ? { lease: "call-hold" } : undefined),
  relayed: undefined as undefined | "xai" | "openai", textQueued: false, realtime: [] as any[], cancel: vi.fn(), nativeMuted: false, loopMuteStates: [] as boolean[], consentAllowed: true, consentHooks: [] as (() => void)[],
  signedIn: true, accountHooks: [] as (() => void)[], appAccess: true, settle: vi.fn(async () => {}), nativeActive: true, interrupt: vi.fn(() => true), speaker: vi.fn(), finish: vi.fn(async () => {}), speak: vi.fn(async () => {}),
  voices: [] as any[], submitted: [] as string[], queued: 0, roomSend: vi.fn(async (): Promise<unknown> => undefined),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "id" }));
vi.mock("expo-audio", () => ({ getRecordingPermissionsAsync: async () => ({ granted: true }), requestRecordingPermissionsAsync: vi.fn() }));
vi.mock("../../../modules/bycoda-voice-companion", () => ({ nativeVoiceCompanion: () => ({ beginSession: async () => `session-${++f.id}`, endSession: f.end, setMuted: (_id: string, value: boolean) => { f.nativeMuted = value; }, getState: () => ({ active: f.nativeActive, sessionId: `session-${f.id}` }), addListener: (_name: string, listener: any) => { f.listeners.push(listener); return { remove: f.removeEvent }; } }) }));
vi.mock("@/state/host-runtime", () => ({ openAssistantVoiceRuntime: async () => ({ release: f.release, request: f.request }) }));
vi.mock("@/state/machines", () => ({ useMachines: { getState: () => ({ machines: [f.machine] }), subscribe: (listener: () => void) => { f.retireHooks.push(listener); return f.unsubscribe; } } }));
vi.mock("@/state/security", () => ({ isAppAccessAllowed: () => f.appAccess, useSecurity: { getState: () => ({ appState: "active" }), subscribe: () => f.unsubscribe } }));
vi.mock("../account/model/account-access", () => ({ isAccountAccessAllowed: () => f.signedIn, useAccountAccess: { subscribe: (listener: () => void) => { f.accountHooks.push(listener); return f.unsubscribe; } } }));
vi.mock("@/state/reviewed-machine", () => ({ reviewedMachine: (machine: unknown) => machine, isReviewedMachine: () => true }));
vi.mock("../privacy/consent-access", () => ({ hasProviderPermission: (machine: { providers?: string[] }) => f.consentAllowed && !machine.providers?.includes("requires-new-consent"), useProviderPermission: { subscribe: (listener: () => void) => { f.consentHooks.push(listener); return f.unsubscribe; } } }));
vi.mock("./assistant-send", () => ({ assistantSendKey: () => "send", readStoredSend: f.read, isAssistantSendPending: () => false, sendRoomMessage: f.roomSend }));
vi.mock("./assistant-voice-native", () => ({ nativeVoiceDependencies: (value: unknown) => value, nativeRealtimeAudio: () => ({}) }));
// The computer-relayed call: it reports its phase and transcript through the session's callbacks.
vi.mock("./assistant-realtime-call", () => ({
  realtimeCallProvider: async () => f.relayed,
  AssistantRealtimeCall: class {
    target?: unknown; started?: Promise<unknown>;
    constructor(readonly dependencies: any) { f.realtime.push(this); }
    start(target: { threadId: string }) {
      this.target = target; this.dependencies.state("listening");
      this.started = this.dependencies.port.request("voice.realtime.start", { threadId: target.threadId }, { retry: false, timeoutMs: 1000 });
      return true;
    }
    stop() { this.dependencies.state("idle"); }
    setMuted() {} interrupt() { return false; } setSpeakerMuted() {}
  },
}));
vi.mock("./assistant-voice", () => ({ AssistantVoice: class { constructor(dependencies: unknown) { f.voices.push(dependencies); } cancel = f.cancel; finish = f.finish; speak = f.speak; } }));
vi.mock("./assistant-client", () => ({ AssistantMobileClient: class {} }));
vi.mock("./assistant-companion-state", () => ({ useAssistantCompanion: { getState: () => ({ thread: { id: "thread", projectId: "project" } }) }, retainAssistantSpeech: vi.fn(), settleAssistantVoice: f.settle }));
vi.mock("./assistant-call-loop", () => ({ AssistantCallLoop: class {
  constructor(readonly dependencies: any) { f.loops.push(dependencies); }
  start() { this.dependencies.state("listening"); return true; }
  stop() { this.dependencies.state("idle"); }
  setMuted() { f.loopMuteStates.push(f.nativeMuted); }
  interrupt() { return f.interrupt(); }
  setSpeakerMuted(value: boolean) { f.speaker(value); }
  get queued() { return f.queued; }
  // As the real loop, the typed turn's send runs once its turn comes; here at once.
  submit(text: string) { f.submitted.push(text); return this.dependencies.send(text, {}, () => true, "typed"); }
} }));
import { ASSISTANT_REQUEST_RESPONSE_TIMEOUT_MS } from "../../../../src/shared/model/host-contracts/methods";
import { ASSISTANT_REPLY_WAIT_MS, awaitOverdueReply, startAssistantCall, endAssistantCall, muteAssistantCall, silenceAssistantCall, setAssistantCallSpeakerMuted, finishAssistantCallTurn, sendAssistantCallText } from "./assistant-call-session";
import { AssistantCallError } from "./assistant-call-error";
import { useAssistantCall } from "./assistant-call-state";
import { defaultVoicePreferences, voicePreferences } from "../voice-settings/voice-preferences";
const target = { machineId: "computer", environmentId: "env", threadId: "thread" };
afterEach(() => { endAssistantCall(); f.nativeActive = true; f.id = 0; f.listeners = []; f.loops = []; f.retireHooks = []; f.consentHooks = []; f.consentAllowed = true; f.accountHooks = []; f.signedIn = true; f.appAccess = true; f.machine = { ...f.machine, providers: [], capabilities: [] }; f.relayed = undefined; f.textQueued = false; f.realtime = []; f.nativeMuted = false; f.loopMuteStates = []; f.voices = []; f.submitted = []; f.queued = 0; vi.clearAllMocks(); f.read.mockReset().mockResolvedValue(null); useAssistantCall.setState({ error: undefined }); });
it("retires native call access directly when provider consent is withdrawn", async () => {
  await startAssistantCall(target, () => true);
  f.consentAllowed = false; f.consentHooks[0]!();
  expect(useAssistantCall.getState().phase).toBe("idle"); expect(f.end).toHaveBeenCalledWith("session-1");
});
it("retires a call when the same computer gains a provider requiring new consent", async () => {
  await startAssistantCall(target, () => true);
  f.machine = { ...f.machine, providers: ["requires-new-consent"] }; f.retireHooks[0]!();
  expect(useAssistantCall.getState().phase).toBe("idle"); expect(f.end).toHaveBeenCalledWith("session-1");
});
it("unmutes native recording before the call loop can synchronously start another utterance", async () => {
  await startAssistantCall(target, () => true); muteAssistantCall(true); muteAssistantCall(false);
  expect(f.loopMuteStates).toEqual([true, false]);
});
it("releases an acquired voice peer when stored-send recovery read fails", async () => {
  f.read.mockRejectedValueOnce(new Error("storage unavailable"));
  await startAssistantCall(target, () => true);
  expect(f.release).toHaveBeenCalledOnce(); expect(f.end).toHaveBeenCalledWith("session-1");
  expect(useAssistantCall.getState().phase).toBe("idle");
});
it("cannot publish a late startup after Stop while recovery storage is pending", async () => {
  let finish!: (value: unknown) => void;
  f.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = startAssistantCall(target, () => true);
  await vi.waitFor(() => expect(f.read).toHaveBeenCalledOnce());
  endAssistantCall(); expect(f.release).toHaveBeenCalledOnce(); expect(f.end).toHaveBeenCalledWith("session-1"); finish(null); await pending;
  expect(useAssistantCall.getState().phase).toBe("idle"); expect(f.loops).toHaveLength(0);
  expect(f.release).toHaveBeenCalledOnce();
});
it("ignores a retired loop error and native event after a new call starts", async () => {
  await startAssistantCall(target, () => true); const oldLoop = f.loops[0], oldEvent = f.listeners[0];
  endAssistantCall(); await startAssistantCall(target, () => true);
  oldLoop.state("idle"); oldLoop.error(new Error("old call failed"));
  oldEvent({ sessionId: "session-1", state: { muted: true } });
  expect(useAssistantCall.getState()).toMatchObject({ phase: "listening", sessionId: "session-2", muted: false, error: undefined });
});
it("keeps the current loop failure visible while releasing its native call", async () => {
  await startAssistantCall(target, () => true);
  f.loops[0].state("idle"); f.loops[0].error(new Error("provider unavailable"));
  await Promise.resolve();
  expect(useAssistantCall.getState().phase).toBe("idle");
  expect((useAssistantCall.getState().error as Error).message).toBe("provider unavailable");
  expect(f.release).toHaveBeenCalledOnce(); expect(f.end).toHaveBeenCalledWith("session-1");
});
// Each turn's own leases let the Host unload Whisper and the voice; the reply then waited 9-14 s for both to load.
it("holds one speech lease for the whole call and releases it when the call ends", async () => {
  await startAssistantCall(target, () => true);
  expect(f.request).toHaveBeenCalledWith("voice.local.start", { config: { natural: true } }, expect.anything());
  expect(f.request.mock.calls.some(([method]) => method === "voice.local.release")).toBe(false);
  endAssistantCall();
  expect(f.request).toHaveBeenCalledWith("voice.local.release", { lease: "call-hold" }, expect.anything());
});
it("switches the held voice before the next reply without starting an overlapping runtime", async () => {
  await startAssistantCall(target, () => true);
  voicePreferences.setState({ preferences: { ...defaultVoicePreferences, speaker: "F2" } });
  try {
    await f.loops[0].speak("Reply", target, () => true);
    const requests = f.request.mock.calls.map(([method]) => method);
    expect(requests).toEqual(["voice.local.start", "voice.local.release", "voice.local.start"]);
    expect(f.request).toHaveBeenLastCalledWith("voice.local.start", { config: { natural: true, voiceId: "F2" } }, expect.anything());
    expect(f.speak).toHaveBeenCalledOnce();
  } finally {
    voicePreferences.setState({ preferences: defaultVoicePreferences });
  }
});
it("keeps a started call through the app lock and background, but retires it on sign-out", async () => {
  await startAssistantCall(target, () => true);
  f.appAccess = false;
  expect(f.loops[0].current()).toBe(true);
  expect(useAssistantCall.getState().phase).toBe("listening");
  f.signedIn = false; f.accountHooks[0]!();
  expect(useAssistantCall.getState().phase).toBe("idle"); expect(f.end).toHaveBeenCalledWith("session-1");
});
it("still refuses to start a call while the app is locked", async () => {
  f.appAccess = false;
  await startAssistantCall(target, () => true);
  expect(useAssistantCall.getState().phase).toBe("idle"); expect(f.loops).toHaveLength(0);
});
it("routes Silence, speaker mute and Finish turn to the active call only", async () => {
  expect(silenceAssistantCall()).toBe(false); setAssistantCallSpeakerMuted(true); finishAssistantCallTurn();
  expect(f.speaker).not.toHaveBeenCalled(); expect(f.finish).not.toHaveBeenCalled();
  await startAssistantCall(target, () => true);
  expect(silenceAssistantCall()).toBe(true);
  setAssistantCallSpeakerMuted(true);
  expect(f.speaker).toHaveBeenCalledWith(true); expect(useAssistantCall.getState().speakerMuted).toBe(true);
  finishAssistantCallTurn(); expect(f.finish).toHaveBeenCalledOnce();
  muteAssistantCall(true); finishAssistantCallTurn(); expect(f.finish).toHaveBeenCalledOnce();
  endAssistantCall(); expect(useAssistantCall.getState().speakerMuted).toBe(false);
});
// Three minutes without speech used to end the call as "Call stopped" with an error card.
it("puts an idle call to sleep instead of reporting a failure", async () => {
  const { AssistantCallError } = await import("./assistant-call-error");
  await startAssistantCall(target, () => true);
  f.loops[0].state("idle"); f.loops[0].error(new AssistantCallError("no-speech"));
  await Promise.resolve();
  expect(useAssistantCall.getState()).toMatchObject({ phase: "idle", asleep: true, error: undefined });
  await startAssistantCall(target, () => true);
  expect(useAssistantCall.getState()).toMatchObject({ phase: "listening", asleep: undefined });
  // The phone's own idle timer ends the native session with "timeout": the same sleep, not a failure.
  f.listeners[1]({ sessionId: "session-2", type: "ended", reason: "timeout" });
  expect(useAssistantCall.getState().asleep).toBe(true); expect(useAssistantCall.getState().error).toBeUndefined();
});
it("reopens a dropped voice line with the same mute choices, and End stops trying", async () => {
  vi.useFakeTimers();
  try {
    const { HostWsError } = await import("@/remote/ws-connection");
    await startAssistantCall(target, () => true);
    muteAssistantCall(true); setAssistantCallSpeakerMuted(true);
    useAssistantCall.setState({ stage: "transcription" });
    f.loops[0].state("idle"); f.loops[0].error(new HostWsError("network"));
    await Promise.resolve();
    expect(useAssistantCall.getState()).toMatchObject({ phase: "idle", reconnecting: 1, error: undefined });
    await vi.advanceTimersByTimeAsync(1000);
    expect(useAssistantCall.getState()).toMatchObject({ phase: "listening", reconnecting: undefined, muted: true, speakerMuted: true, sessionId: "session-2" });
    // A second drop schedules another attempt; End cancels it.
    useAssistantCall.setState({ stage: "microphone" });
    f.loops[1].state("idle"); f.loops[1].error(new HostWsError("network"));
    await Promise.resolve();
    expect(useAssistantCall.getState().reconnecting).toBe(1);
    endAssistantCall();
    expect(useAssistantCall.getState().reconnecting).toBeUndefined();
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.loops).toHaveLength(2);
  } finally { vi.useRealTimers(); }
});
it("never reopens a call whose send result is unknown", async () => {
  const { HostWsError } = await import("@/remote/ws-connection");
  await startAssistantCall(target, () => true);
  useAssistantCall.setState({ stage: "reply" });
  const error = new HostWsError("network", true);
  f.loops[0].state("idle"); f.loops[0].error(error);
  await Promise.resolve();
  expect(useAssistantCall.getState()).toMatchObject({ reconnecting: undefined, error });
});

// Starting a call cancelled message dictation without waiting; its recognition-only lease, still starting,
// made older computers refuse the call with "voice is in use without spoken replies".
it("asks for the call's reply voice only after this phone's dictation lease is released", async () => {
  let settled!: () => void;
  f.settle.mockImplementationOnce(() => new Promise<void>(resolve => { settled = resolve; }));
  const starting = startAssistantCall(target, () => true);
  await vi.waitFor(() => expect(f.settle).toHaveBeenCalledOnce());
  expect(f.request.mock.calls.some(([method]) => method === "voice.local.start")).toBe(false);
  settled();
  await starting;
  expect(f.request).toHaveBeenCalledWith("voice.local.start", { config: { natural: true } }, expect.anything());
});
// A failed start's "Voice call unavailable" stayed in the chat header after End and after switching to chat.
it("clears the last failure on End but keeps the reason the voice service ended the call", async () => {
  useAssistantCall.setState({ error: new Error("old failure") });
  endAssistantCall();
  expect(useAssistantCall.getState().error).toBeUndefined();
  await startAssistantCall(target, () => true);
  f.nativeActive = false;
  f.listeners[0]({ sessionId: "session-1", type: "ended", reason: "capture-error" });
  expect(useAssistantCall.getState().phase).toBe("idle");
  const { AssistantCallError } = await import("./assistant-call-error");
  expect((useAssistantCall.getState().error as InstanceType<typeof AssistantCallError>).reason).toBe("microphone-failed");
});
// A reply longer than the phone's wait stopped the call with "connection interrupted" while the assistant kept working.
it("waits on the receipt of an overdue reply until the computer settles it", async () => {
  const { HostWsError } = await import("@/remote/ws-connection");
  const wait = vi.fn(async () => {});
  const messages = [{ id: "reply", role: "assistant", text: "Done" }];
  const check = vi.fn()
    .mockResolvedValueOnce({ kind: "unknown" })
    .mockRejectedValueOnce(new HostWsError("deadline", true))
    .mockResolvedValueOnce({ kind: "settled", messages });
  await expect(awaitOverdueReply(check, () => true, { wait })).resolves.toEqual({ kind: "settled", messages });
  expect(check).toHaveBeenCalledTimes(3);
  const dropped = new HostWsError("network");
  await expect(awaitOverdueReply(vi.fn().mockRejectedValue(dropped), () => true, { wait })).resolves.toEqual({ kind: "unknown", cause: dropped });
  await expect(awaitOverdueReply(vi.fn(), () => false, { wait })).rejects.toMatchObject({ reason: "stopped" });
  const pending = vi.fn().mockResolvedValue({ kind: "unknown" });
  await expect(awaitOverdueReply(pending, () => true, { wait, pollMs: 1000, limitMs: 3000 })).resolves.toEqual({ kind: "unknown", cause: undefined });
  expect(pending).toHaveBeenCalledTimes(3);
});
it("waits for a reply longer than the computer's own limit", () => {
  expect(ASSISTANT_REPLY_WAIT_MS).toBeGreaterThan(ASSISTANT_REQUEST_RESPONSE_TIMEOUT_MS);
});

it("sends typed text only through the call of its own conversation and publishes its waiting state", async () => {
  await expect(sendAssistantCallText("Hello", target)).rejects.toMatchObject({ reason: "stopped" });
  await startAssistantCall(target, () => true);
  await expect(sendAssistantCallText("Hello", { ...target, threadId: "other" })).rejects.toMatchObject({ reason: "stopped" });
  expect(f.submitted).toEqual([]);
  let admit!: (value: unknown) => void;
  f.roomSend.mockImplementationOnce(() => new Promise(resolve => { admit = resolve; }));
  f.request.mockImplementation(async (method: string) => method === "voice.local.start" ? { lease: "call-hold" }
    : method === "projects.directory" ? { privacyReady: true, projects: [{ id: "project", registered: true }] } : undefined);
  const sent = sendAssistantCallText("Hello", target);
  expect(f.submitted).toEqual(["Hello"]);
  await vi.waitFor(() => expect(f.roomSend).toHaveBeenCalledOnce());
  expect(useAssistantCall.getState()).toMatchObject({ typed: "sending", utterance: "Hello" });
  admit({ kind: "settled", messages: [{ role: "assistant", text: "Hi there", projectIds: ["project"] }] });
  await expect(sent).resolves.toBeUndefined();
  expect(useAssistantCall.getState()).toMatchObject({ typed: undefined, lastReply: "Hi there" });
  f.request.mockReset().mockImplementation(async (method: string) => method === "voice.local.start" ? { lease: "call-hold" } : undefined);
});
it("treats an admitted typed message as delivered even when its reply then fails, and keeps a refused one unsent", async () => {
  await startAssistantCall(target, () => true);
  f.request.mockImplementation(async (method: string) => method === "voice.local.start" ? { lease: "call-hold" }
    : method === "projects.directory" ? { privacyReady: true, projects: [{ id: "project", registered: true }] } : undefined);
  try {
    f.roomSend.mockResolvedValueOnce({ kind: "settled", messages: [{ role: "assistant", text: "Private", projectIds: ["hidden"] }] });
    await expect(sendAssistantCallText("Delivered", target)).resolves.toBeUndefined();
    f.roomSend.mockResolvedValueOnce({ kind: "refused" });
    const refused = sendAssistantCallText("Refused", target);
    await expect(refused).rejects.toBeInstanceOf(AssistantCallError);
    await expect(refused).rejects.toMatchObject({ reason: "reply-refused" });
  } finally { f.request.mockReset().mockImplementation(async (method: string) => method === "voice.local.start" ? { lease: "call-hold" } : undefined); }
});
it("ends a capture for a typed message once recording has begun, never before", async () => {
  await startAssistantCall(target, () => true);
  useAssistantCall.setState({ capture: "preparing" });
  f.loops[0].endCapture();
  expect(f.finish).not.toHaveBeenCalled();
  f.voices[0].state("recording");
  expect(f.finish).toHaveBeenCalledOnce();
  f.voices[0].state("recording");
  expect(f.finish).toHaveBeenCalledOnce();
  f.loops[0].endCapture();
  expect(f.finish).toHaveBeenCalledTimes(2);
});

/** The computer's realtime relay: its lease, and whether it queued a typed message behind a reply. */
function relayComputer() {
  f.request.mockImplementation(async (method: string) => method === "voice.realtime.start" ? { lease: "relay-lease", inRate: 16000, outRate: 24000 }
    : method === "voice.realtime.text" ? { queued: f.textQueued } : undefined);
}
afterEach(() => { f.request.mockImplementation(async (method: string) => method === "voice.local.start" ? { lease: "call-hold" } : undefined); });
it("sends text typed during a computer-relayed call to its realtime voice, waiting while the computer queues it", async () => {
  relayComputer();
  f.relayed = "xai"; f.machine = { ...f.machine, capabilities: ["voice.realtime.relay.v1", "voice.realtime.relay.v2"] };
  await startAssistantCall(target, () => true);
  await f.realtime[0].started;
  f.textQueued = true;
  const sent = sendAssistantCallText("  Hello  ", target);
  expect(useAssistantCall.getState().typed).toBe("sending");
  await vi.waitFor(() => expect(useAssistantCall.getState().typed).toBe("queued"));
  expect(f.request).toHaveBeenCalledWith("voice.realtime.text", { lease: "relay-lease", text: "Hello" }, expect.objectContaining({ retry: false }));
  // Never the on-computer Room send beside the realtime turn.
  expect(f.roomSend).not.toHaveBeenCalled();
  let settled = false; void sent.then(() => { settled = true; });
  await Promise.resolve(); await Promise.resolve();
  expect(settled).toBe(false);
  // The computer sent it as the next turn: the transcript shows it and the composer can clear its draft.
  f.realtime[0].dependencies.transcript("user", "Hello");
  await expect(sent).resolves.toBeUndefined();
  expect(useAssistantCall.getState()).toMatchObject({ typed: undefined, utterance: "Hello" });
  // Nothing in flight: the computer sends it at once.
  f.textQueued = false;
  await expect(sendAssistantCallText("Again", target)).resolves.toBeUndefined();
  expect(useAssistantCall.getState().typed).toBeUndefined();
});

it("keeps a queued realtime message unsent when the call ends, and refuses typing on a computer without realtime text", async () => {
  relayComputer();
  f.relayed = "openai"; f.machine = { ...f.machine, capabilities: ["voice.realtime.relay.v1", "voice.realtime.relay.v2"] };
  await startAssistantCall(target, () => true);
  await f.realtime[0].started;
  f.textQueued = true;
  const sent = sendAssistantCallText("Later", target);
  await vi.waitFor(() => expect(useAssistantCall.getState().typed).toBe("queued"));
  endAssistantCall();
  await expect(sent).rejects.toMatchObject({ reason: "stopped" });
  expect(useAssistantCall.getState().typed).toBeUndefined();
  f.machine = { ...f.machine, capabilities: ["voice.realtime.relay.v1"] };
  f.request.mockClear();
  await startAssistantCall(target, () => true);
  await f.realtime[1].started;
  await expect(sendAssistantCallText("Hi", target)).rejects.toMatchObject({ category: "unsupported" });
  expect(f.request.mock.calls.some(([method]) => method === "voice.realtime.text")).toBe(false);
});

it("tells the realtime call whether the computer is a v2 relay and publishes whether speaking interrupts", async () => {
  relayComputer();
  f.relayed = "openai"; f.machine = { ...f.machine, capabilities: ["voice.realtime.relay.v1", "voice.realtime.relay.v2"] };
  await startAssistantCall(target, () => true);
  await f.realtime[0].started;
  expect(f.realtime[0].dependencies.relayV2).toBe(true);
  expect(useAssistantCall.getState().spokenInterrupt).toBeUndefined();
  f.realtime[0].dependencies.spokenInterrupt(false);
  expect(useAssistantCall.getState().spokenInterrupt).toBe(false);
  // Ending the call clears it, so no later call inherits the hint.
  endAssistantCall();
  expect(useAssistantCall.getState().spokenInterrupt).toBeUndefined();
  f.machine = { ...f.machine, capabilities: ["voice.realtime.relay.v1"] };
  await startAssistantCall(target, () => true);
  await f.realtime[1].started;
  expect(f.realtime[1].dependencies.relayV2).toBe(false);
});
