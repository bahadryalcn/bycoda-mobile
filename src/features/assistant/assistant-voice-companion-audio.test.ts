import { expect, it, vi } from "vitest";
import type { NativeVoiceCompanion, NativeVoiceEvent } from "../../../modules/bycoda-voice-companion";
const file = vi.hoisted(() => ({ write: vi.fn(), delete: vi.fn() }));
vi.mock("expo-file-system", () => ({ Paths: { cache: "file:///cache" }, File: class {
  uri = "file:///cache/bycoda-voice-fixture.wav"; exists = true; write = file.write; delete = file.delete;
} }));
import { companionVoiceCapture, companionVoicePlayback } from "./assistant-voice-companion-audio";
import { pcmBase64 } from "../../../../src/features/voice/model/voiceVad";

function fixture() {
  let listener: (event: NativeVoiceEvent) => void = () => {};
  const remove = vi.fn();
  const native = { getState: () => ({ active: true, sessionId: "original" }),
    startCapture: vi.fn(async () => {}), stopCapture: vi.fn(), endSession: vi.fn(),
    playWav: vi.fn(async () => {}), stopPlayback: vi.fn(), beginPlaybackSession: vi.fn(async () => "standalone"),
    addListener: (_name: string, next: typeof listener) => { listener = next; return { remove }; },
  } as unknown as NativeVoiceCompanion;
  return { native, remove, emit: (event: Omit<NativeVoiceEvent, "sessionId"> & { sessionId?: string }) => listener({ sessionId: "original", ...(event.type === "pcm" ? { captureId: vi.mocked(native.startCapture).mock.calls.at(-1)?.[1] } : {}), ...event }) };
}
it("accepts PCM only from the captured native session and reports bounded capture completion", async () => {
  const f = fixture(), buffer = vi.fn(), ended = vi.fn();
  const capture = companionVoiceCapture(f.native, buffer, ended); await capture.start();
  f.emit({ type: "pcm", sessionId: "other", audio: "AAAA", sampleRate: 16000 });
  expect(buffer).not.toHaveBeenCalled();
  f.emit({ type: "pcm", audio: pcmBase64(new Int16Array([1, -2])), sampleRate: 16000 });
  expect(buffer).toHaveBeenCalledWith(new Int16Array([1, -2]), 16000);
  f.emit({ type: "ended", reason: "limit" }); expect(ended).toHaveBeenCalledWith("limit", undefined);
  capture.stop();
  f.emit({ type: "pcm", audio: "AAAA", sampleRate: 16000 });
  expect(buffer).toHaveBeenCalledOnce(); expect(f.remove).toHaveBeenCalledOnce();
  expect(f.native.stopCapture).toHaveBeenCalledWith("original", expect.any(String));
  expect(f.native.endSession).not.toHaveBeenCalled();
});
it("does not consume another utterance's PCM inside the same native call session", async () => {
  const f = fixture(), buffer = vi.fn();
  const capture = companionVoiceCapture(f.native, buffer); await capture.start();
  f.emit({ type: "pcm", captureId: "different-utterance", audio: pcmBase64(new Int16Array([1, -2])), sampleRate: 16000 });
  expect(buffer).not.toHaveBeenCalled(); capture.stop();
});
it("does not stop native capture when a never-started listener is canceled", () => {
  const f = fixture(); companionVoiceCapture(f.native, vi.fn()).stop();
  expect(f.native.stopCapture).not.toHaveBeenCalled();
});
it("uses distinct capture ownership for utterances sharing one native session", async () => {
  const f = fixture(), first = companionVoiceCapture(f.native, vi.fn()), second = companionVoiceCapture(f.native, vi.fn());
  await first.start(); await second.start(); first.stop();
  const firstId = vi.mocked(f.native.startCapture).mock.calls[0]?.[1];
  const secondId = vi.mocked(f.native.startCapture).mock.calls[1]?.[1];
  expect(firstId).toEqual(expect.any(String)); expect(firstId).not.toBe(secondId);
  expect(f.native.stopCapture).toHaveBeenCalledWith("original", firstId); second.stop();
});
it("stops a deferred native start again after cancellation without adopting a new session", async () => {
  const f = fixture(); let finish!: () => void;
  vi.mocked(f.native.startCapture).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const capture = companionVoiceCapture(f.native, vi.fn()); const pending = capture.start();
  capture.stop(); finish(); await pending;
  expect(f.native.stopCapture).toHaveBeenCalledTimes(2);
  expect(vi.mocked(f.native.stopCapture).mock.calls.every(([id]) => id === "original")).toBe(true);
});
it("settles native playback on notification stop and removes its temporary WAV", async () => {
  const f = fixture(); file.delete.mockClear();
  const playback = companionVoicePlayback(f.native);
  const pending = playback.play(new Uint8Array(44), () => true);
  expect(f.native.playWav).toHaveBeenCalledWith("original", expect.any(String), "file:///cache/bycoda-voice-fixture.wav");
  f.emit({ type: "ended", reason: "stopped" });
  await expect(pending).rejects.toThrow("Voice session stopped.");
  expect(f.native.stopPlayback).toHaveBeenCalledWith("original", expect.any(String)); expect(file.delete).toHaveBeenCalledOnce();
});
it("keeps playback cancellation scoped to its own utterance inside a shared call session", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
  const f = fixture(), first = companionVoicePlayback(f.native), second = companionVoicePlayback(f.native);
  const oldPlay = first.play(new Uint8Array(44), () => true);
  const firstId = vi.mocked(f.native.playWav).mock.calls.at(-1)![1];
  const nextPlay = second.play(new Uint8Array(44), () => true);
  const secondId = vi.mocked(f.native.playWav).mock.calls.at(-1)![1];
  try {
    first.stop(); await oldPlay;
    expect(firstId).not.toBe(secondId);
    expect(f.native.stopPlayback).toHaveBeenLastCalledWith("original", firstId);
  } finally { first.stop(); second.stop(); await Promise.allSettled([oldPlay, nextPlay]); clock.mockRestore(); }
});
it("cleans up standalone playback authority when writing its cache file fails", async () => {
  const f = fixture();
  vi.spyOn(f.native, "getState").mockReturnValue({ active: false, sessionId: "", phase: "idle", muted: false, pip: false });
  file.write.mockImplementationOnce(() => { throw new Error("disk full"); });
  await expect(companionVoicePlayback(f.native).play(new Uint8Array(44), () => true)).rejects.toThrow("disk full");
  expect(f.native.beginPlaybackSession).toHaveBeenCalledOnce();
  expect(f.native.endSession).toHaveBeenCalledWith("standalone");
});
