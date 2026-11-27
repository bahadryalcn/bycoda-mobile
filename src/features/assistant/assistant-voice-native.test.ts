import { afterEach, expect, it, vi } from "vitest";
const platform = vi.hoisted(() => ({ OS: "ios" }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => JSON.stringify({ engine: "cloud" }) },
}));
vi.mock("react-native", () => ({ Platform: platform }));
const bridge = vi.hoisted(() => ({ active: false, beginSession: vi.fn(async () => { bridge.active = true; return "native-session"; }), endSession: vi.fn(), getState: vi.fn(() => ({ active: bridge.active, sessionId: "native-session" })), startCapture: vi.fn(async () => {}), stopCapture: vi.fn(), addListener: vi.fn(() => ({ remove: vi.fn() })) }));
vi.mock("../../../modules/bycoda-voice-companion", () => ({ nativeVoiceCompanion: () => bridge }));
afterEach(() => { platform.OS = "ios"; bridge.active = false; vi.clearAllMocks(); });
const native = vi.hoisted(() => ({ permission: vi.fn(async () => ({ granted: true })), requestPermission: vi.fn(async () => ({ granted: true })), start: vi.fn(async () => {}), stop: vi.fn(), release: vi.fn(), remove: vi.fn() }));
vi.mock("expo-audio", () => ({ getRecordingPermissionsAsync: native.permission, requestRecordingPermissionsAsync: native.requestPermission, setAudioModeAsync: async () => {},
  AudioModule: { AudioStream: class { start = native.start; stop = native.stop; release = native.release; addListener() { return { remove: native.remove }; } } } }));
vi.mock("expo-file-system", () => ({}));

it("loads the saved engine before the first capture without opening settings", async () => {
  const dependencies = nativeVoiceDependencies({ state: vi.fn(), transcript: vi.fn(), error: vi.fn() });
  const capture = await dependencies.capture(vi.fn());
  try {
    expect(dependencies.engine?.()).toBe("cloud");
  } finally {
    capture.stop();
  }
});
import { nativeVoiceDependencies, speechWav } from "./assistant-voice-native";
import { pcmBase64 } from "../../../../src/shared/model/voice-realtime/voiceVad";

it("borrows an overall Android call service without ending it between utterances", async () => {
  platform.OS = "android"; bridge.active = true;
  const dependencies = nativeVoiceDependencies({ state: vi.fn(), transcript: vi.fn(), error: vi.fn() });
  const capture = await dependencies.capture(vi.fn()); await capture.start(); capture.stop();
  expect(bridge.startCapture).toHaveBeenCalledWith("native-session", expect.any(String));
  expect(bridge.stopCapture).toHaveBeenCalledWith("native-session", expect.any(String));
  expect(bridge.beginSession).not.toHaveBeenCalled(); expect(bridge.endSession).not.toHaveBeenCalled();
});
it("records an iOS call through its native call engine, and dictation outside a call through expo-audio", async () => {
  bridge.active = true;
  const dependencies = nativeVoiceDependencies({ state: vi.fn(), transcript: vi.fn(), error: vi.fn() });
  const call = await dependencies.capture(vi.fn()); await call.start(); call.stop();
  expect(bridge.startCapture).toHaveBeenCalledWith("native-session", expect.any(String));
  expect(native.start).not.toHaveBeenCalled(); expect(bridge.endSession).not.toHaveBeenCalled();
  bridge.active = false;
  const dictation = await dependencies.capture(vi.fn()); await dictation.start(); dictation.stop();
  expect(native.start).toHaveBeenCalledOnce(); expect(bridge.beginSession).not.toHaveBeenCalled();
});
it("ends only its own foreground Android dictation session", async () => {
  platform.OS = "android";
  const dependencies = nativeVoiceDependencies({ state: vi.fn(), transcript: vi.fn(), error: vi.fn() });
  const capture = await dependencies.capture(vi.fn()); capture.stop();
  expect(bridge.beginSession).toHaveBeenCalledOnce(); expect(bridge.endSession).toHaveBeenCalledWith("native-session");
});

it("does not reopen Android permission UI after microphone permission is granted", async () => {
  vi.clearAllMocks();
  const dependencies = nativeVoiceDependencies({ state: vi.fn(), transcript: vi.fn(), error: vi.fn() });
  const capture = await dependencies.capture(vi.fn());
  expect(native.permission).toHaveBeenCalledOnce();
  expect(native.requestPermission).not.toHaveBeenCalled();
  capture.stop();
});

it("writes local speech PCM as little-endian mono WAV with the actual synthesis rate", () => {
  const bytes = speechWav([{ audio: pcmBase64(new Int16Array([-32768, 0, 32767])), sampleRate: 24000 }]);
  const view = new DataView(bytes.buffer);
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
  expect(view.getUint32(24, true)).toBe(24000);
  expect(view.getUint16(22, true)).toBe(1);
  expect(view.getUint32(40, true)).toBe(6);
  expect(view.getInt16(44, true)).toBe(-32768);
  expect(view.getInt16(48, true)).toBe(32767);
});
it("rejects inconsistent speech rates and malformed PCM", () => {
  expect(() => speechWav([{ audio: "AAAA", sampleRate: 16000 }, { audio: "AAAA", sampleRate: 24000 }])).toThrow("sample rate");
  expect(() => speechWav([{ audio: "AA==", sampleRate: 16000 }])).toThrow("speech audio");
});

it("stops a native microphone again after a cancelled asynchronous start settles, then releases it", async () => {
  vi.clearAllMocks();
  let settle!: () => void;
  native.start.mockImplementationOnce(() => new Promise<void>(resolve => { settle = resolve; }));
  const dependencies = nativeVoiceDependencies({ state: vi.fn(), transcript: vi.fn(), error: vi.fn() });
  const capture = await dependencies.capture(vi.fn());
  const pending = capture.start();
  capture.stop();
  expect(native.stop).toHaveBeenCalledTimes(1);
  expect(native.release).not.toHaveBeenCalled();
  settle(); await pending;
  expect(native.stop).toHaveBeenCalledTimes(2);
  expect(native.release).toHaveBeenCalledTimes(1);
  capture.stop(); expect(native.release).toHaveBeenCalledTimes(1);
});

it("keeps the microphone briefly after Finish so the last word is recorded", () => {
  const dependencies = nativeVoiceDependencies({ state: vi.fn(), transcript: vi.fn(), error: vi.fn() });
  expect(dependencies.tailMs).toBe(400);
});
