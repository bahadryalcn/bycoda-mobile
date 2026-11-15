import { afterEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  machine: { id: "computer", environmentId: "env", providers: [] as string[] }, id: 0, listeners: [] as any[], loops: [] as any[], retireHooks: [] as (() => void)[],
  release: vi.fn(), removeEvent: vi.fn(), unsubscribe: vi.fn(), read: vi.fn(async () => null as unknown),
  end: vi.fn(), request: vi.fn(), cancel: vi.fn(), nativeMuted: false, loopMuteStates: [] as boolean[], consentAllowed: true, consentHooks: [] as (() => void)[],
}));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "id" }));
vi.mock("expo-audio", () => ({ getRecordingPermissionsAsync: async () => ({ granted: true }), requestRecordingPermissionsAsync: vi.fn() }));
vi.mock("../../../modules/bycoda-voice-companion", () => ({ nativeVoiceCompanion: () => ({ beginSession: async () => `session-${++f.id}`, endSession: f.end, setMuted: (_id: string, value: boolean) => { f.nativeMuted = value; }, getState: () => ({ active: true, sessionId: `session-${f.id}` }), addListener: (_name: string, listener: any) => { f.listeners.push(listener); return { remove: f.removeEvent }; } }) }));
vi.mock("@/state/host-runtime", () => ({ openAssistantVoiceRuntime: async () => ({ release: f.release, request: f.request }) }));
vi.mock("@/state/machines", () => ({ useMachines: { getState: () => ({ machines: [f.machine] }), subscribe: (listener: () => void) => { f.retireHooks.push(listener); return f.unsubscribe; } } }));
vi.mock("@/state/security", () => ({ isAppAccessAllowed: () => true, useSecurity: { getState: () => ({ appState: "active" }), subscribe: () => f.unsubscribe } }));
vi.mock("@/state/reviewed-machine", () => ({ reviewedMachine: (machine: unknown) => machine, isReviewedMachine: () => true }));
vi.mock("../privacy/consent-access", () => ({ hasProviderPermission: (machine: { providers?: string[] }) => f.consentAllowed && !machine.providers?.includes("requires-new-consent"), useProviderPermission: { subscribe: (listener: () => void) => { f.consentHooks.push(listener); return f.unsubscribe; } } }));
vi.mock("./assistant-send", () => ({ assistantSendKey: () => "send", readStoredSend: f.read, isAssistantSendPending: () => false, sendRoomMessage: vi.fn() }));
vi.mock("./assistant-voice-native", () => ({ nativeVoiceDependencies: (value: unknown) => value }));
vi.mock("./assistant-voice", () => ({ AssistantVoice: class { cancel = f.cancel; } }));
vi.mock("./assistant-client", () => ({ AssistantMobileClient: class {} }));
vi.mock("./assistant-companion-state", () => ({ useAssistantCompanion: { getState: () => ({ thread: { id: "thread", projectId: "project" } }) }, retainAssistantSpeech: vi.fn() }));
vi.mock("./assistant-call-loop", () => ({ AssistantCallLoop: class {
  constructor(readonly dependencies: any) { f.loops.push(dependencies); }
  start() { this.dependencies.state("listening"); return true; }
  stop() { this.dependencies.state("idle"); }
  setMuted() { f.loopMuteStates.push(f.nativeMuted); }
} }));
import { startAssistantCall, endAssistantCall, muteAssistantCall } from "./assistant-call-session";
import { useAssistantCall } from "./assistant-call-state";
const target = { machineId: "computer", environmentId: "env", threadId: "thread" };
afterEach(() => { endAssistantCall(); f.id = 0; f.listeners = []; f.loops = []; f.retireHooks = []; f.consentHooks = []; f.consentAllowed = true; f.machine = { ...f.machine, providers: [] }; f.nativeMuted = false; f.loopMuteStates = []; vi.clearAllMocks(); f.read.mockReset().mockResolvedValue(null); useAssistantCall.setState({ error: undefined }); });
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
