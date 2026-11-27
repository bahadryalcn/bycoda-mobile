import { afterEach, expect, it, vi } from "vitest";
import type { HostSocketNative, CredentialBinding, NativeCredentialHandle } from "../../modules/bycoda-host-socket/src/types";
const f = vi.hoisted(() => ({ start: vi.fn(async () => {}), close: vi.fn(), request: vi.fn(async () => ({})), supports: vi.fn((_method: string) => true), args: [] as unknown[] }));
vi.mock("../remote/ws-connection", async importOriginal => ({
  ...await importOriginal<typeof import("../remote/ws-connection")>(),
  MobileHostWsConnection: class { constructor(...args: unknown[]) { f.args = args; } start = f.start; close = f.close; request = f.request; supports = f.supports; },
}));
import { allowsVoiceRequest, openScopedVoiceConnection } from "./host-voice-runtime";
afterEach(() => { vi.clearAllMocks(); f.start.mockReset().mockResolvedValue(); f.supports.mockReset().mockReturnValue(true); });
const scope = { sessionId: "native-session", threadId: "reviewed-thread", projectId: "reviewed-project" };
it("limits background access to voice, the reviewed thread and exact project", () => {
  expect(allowsVoiceRequest(scope, "voice.local.transcribe", {})).toBe(true);
  expect(allowsVoiceRequest(scope, "voice.cloud.transcribe", {})).toBe(true);
  expect(allowsVoiceRequest(scope, "voice.cloud.setKey", {})).toBe(false);
  expect(allowsVoiceRequest(scope, "assistant.request", { op: "threads.send", threadId: scope.threadId })).toBe(true);
  expect(allowsVoiceRequest(scope, "assistant.request", { op: "threads.sendIdentity" })).toBe(true);
  expect(allowsVoiceRequest(scope, "assistant.request", { op: "threads.sendIdentity", threadId: "other" })).toBe(false);
  expect(allowsVoiceRequest(scope, "projects.directory", {})).toBe(true);
  for (const params of [{ op: "threads.send", threadId: "other" }, { op: "profile.update" }, { op: "pauseAll" }, { op: "threads.open" }, { op: "snapshot" }])
    expect(allowsVoiceRequest(scope, "assistant.request", params)).toBe(false);
  for (const method of ["files.read", "terminal.input", "sessions.send", "projects.list", "voice.realtime.start"])
    expect(allowsVoiceRequest(scope, method, {})).toBe(false);
  expect(allowsVoiceRequest(scope, "projects.get", { id: "other" })).toBe(false);
  expect(allowsVoiceRequest(scope, "projects.directory", { projectId: "other" })).toBe(false);
});
it("lets the call drive its computer-side realtime voice only for the reviewed thread", () => {
  for (const method of ["voice.realtime.audio", "voice.realtime.next", "voice.realtime.interrupt", "voice.realtime.text", "voice.realtime.end"])
    expect(allowsVoiceRequest(scope, method, { lease: "lease" })).toBe(true);
  expect(allowsVoiceRequest(scope, "voice.realtime.start", { threadId: scope.threadId, provider: "openai" })).toBe(true);
  expect(allowsVoiceRequest(scope, "voice.realtime.start", { threadId: "other", provider: "openai" })).toBe(false);
  expect(allowsVoiceRequest(scope, "voice.call.settings.get", {})).toBe(true);
  expect(allowsVoiceRequest(scope, "voice.call.settings.get", { mode: "grok" })).toBe(false);
  for (const method of ["voice.call.settings.set", "voice.realtime.secret"]) expect(allowsVoiceRequest(scope, method, {})).toBe(false);
});
const binding: CredentialBinding = { machineId: "machine", environmentId: "env", endpoint: "wss://host.invalid/ws", credentialGeneration: 1, accessEpoch: 1 };
function native() { return { acquireVoiceCredential: vi.fn(async () => ({ handle: "handle", ...binding })), openVoice: vi.fn(), send: vi.fn(), close: vi.fn(), acknowledge: vi.fn(), addListener: vi.fn() } as unknown as HostSocketNative; }
it("captures binding and target before credential acquisition and cannot be retargeted by caller mutation", async () => {
  const bridge = native(), reviewed = { ...binding }, captured = { ...scope };
  let finish!: (value: NativeCredentialHandle) => void;
  vi.mocked(bridge.acquireVoiceCredential!).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = openScopedVoiceConnection(bridge, reviewed, captured, () => true);
  reviewed.endpoint = "wss://different.invalid/ws"; captured.threadId = "different-thread";
  finish({ handle: "handle", ...binding }); const port = await pending;
  expect(f.args[1]).toMatchObject({ endpoint: binding.endpoint });
  await port.request("assistant.request", { op: "threads.messages", threadId: scope.threadId });
  expect(() => port.request("assistant.request", { op: "threads.messages", threadId: "different-thread" })).toThrow();
  port.release();
});
it("closes a peer once on release and retires its current/request authority", async () => {
  const port = await openScopedVoiceConnection(native(), binding, scope, () => true);
  port.release(); port.release();
  expect(f.close).toHaveBeenCalledOnce(); expect(port.current()).toBe(false);
  expect(() => port.request("voice.local.start", {})).toThrow();
});
it("closes a peer if authority expires while its handshake is pending", async () => {
  let current = true;
  f.start.mockImplementationOnce(async () => { current = false; });
  await expect(openScopedVoiceConnection(native(), binding, scope, () => current)).rejects.toThrow();
  expect(f.close).toHaveBeenCalledOnce();
});
it("names an outdated Host instead of failing the first voice request as incompatible data", async () => {
  f.supports.mockImplementation(method => !method.startsWith("voice."));
  await expect(openScopedVoiceConnection(native(), binding, scope, () => true)).rejects.toMatchObject({ category: "unsupported" });
  expect(f.close).toHaveBeenCalledOnce();
});
it("refuses at the start when the Host would not take the spoken message on the voice socket", async () => {
  f.supports.mockImplementation(method => method !== "assistant.request");
  await expect(openScopedVoiceConnection(native(), binding, scope, () => true)).rejects.toMatchObject({ category: "unsupported" });
  expect(f.close).toHaveBeenCalledOnce();
});
