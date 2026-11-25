import { expect, it, vi } from "vitest";
import { AssistantVoice, speechParts, type SpeechChunk, type VoicePort } from "./assistant-voice";

const target = { machineId: "phone-host", environmentId: "host-env", threadId: "room-thread" };
function setup() {
  let current = true;
  let buffer: (data: Int16Array, rate: number) => void = () => {};
  let ended: (reason: string, error?: string) => void = () => {};
  const capture = { start: vi.fn(async () => {}), stop: vi.fn() };
  const request = vi.fn(async (method: string, _params?: { id?: string; text?: string }): Promise<unknown> => method === "voice.local.start" ? { lease: "lease-one" }
    : method === "voice.local.transcribe" ? { text: "Review the current project" } : {});
  const dependencies = {
    capture: vi.fn(async (onBuffer: typeof buffer, onEnded?: typeof ended) => { buffer = onBuffer; ended = onEnded ?? (() => {}); return capture; }),
    play: vi.fn(async () => {}), stopPlayback: vi.fn(), state: vi.fn(), transcript: vi.fn(), error: vi.fn(), level: vi.fn(),
  };
  const port = { current: () => current, request } as unknown as VoicePort;
  return { voice: new AssistantVoice(dependencies), dependencies, port, request, capture,
    ended: (reason: string, error?: string) => ended(reason, error),
    buffer: (data: Int16Array, rate = 16000) => buffer(data, rate), revoke: () => { current = false; }, restore: () => { current = true; } };
}

it("captures real PCM, resamples hardware audio and returns text only to its captured Room draft", async () => {
  const state = setup();
  await state.voice.record(state.port, target);
  state.buffer(new Int16Array(4800).fill(1000), 48000);
  await state.voice.finish();
  expect(state.capture.start).toHaveBeenCalledTimes(1);
  expect(state.capture.stop).toHaveBeenCalledTimes(1);
  const payload = state.request.mock.calls.find(([method]) => method === "voice.local.transcribe") as unknown as [string, { audio: string }];
  expect(atob(payload[1].audio)).toHaveLength(3200);
  expect(state.dependencies.transcript).toHaveBeenCalledWith(target, "Review the current project");
  expect(state.request.mock.calls.map(([method]) => method)).toEqual(["voice.local.start", "voice.local.transcribe", "voice.local.release"]);
});

// A quiet room's noise passed the speech detector, Whisper returned "" and the whole call stopped.
it("treats an empty transcription like silence instead of failing the turn", async () => {
  const state = setup();
  state.request.mockImplementation(async (method: string) => method === "voice.local.start" ? { lease: "lease-one" } : method === "voice.local.transcribe" ? { text: "  " } : {});
  await state.voice.record(state.port, target);
  state.buffer(new Int16Array(4800).fill(1000), 48000);
  await state.voice.finish();
  expect(state.dependencies.error).not.toHaveBeenCalled();
  expect(state.dependencies.transcript).toHaveBeenCalledWith(target, "");
});

it("publishes measured microphone energy only during recording and clears it on cancellation", async () => {
  const state = setup();
  await state.voice.record(state.port, target);
  state.buffer(new Int16Array(3200).fill(4096));
  expect(state.dependencies.level).toHaveBeenLastCalledWith(0.5);
  state.voice.cancel();
  expect(state.dependencies.level).toHaveBeenLastCalledWith(0);
  state.dependencies.level.mockClear();
  state.buffer(new Int16Array(3200).fill(32767));
  expect(state.dependencies.level).not.toHaveBeenCalled();
});

it("never starts a Host lease or mic when native microphone permission fails", async () => {
  const state = setup();
  state.dependencies.capture.mockRejectedValueOnce(new Error("Permission denied"));
  await state.voice.record(state.port, target);
  expect(state.request).not.toHaveBeenCalled();
  expect(state.capture.start).not.toHaveBeenCalled();
  expect(state.dependencies.error).toHaveBeenCalledWith(new Error("Permission denied"));
});

it("releases a lease that arrives after cancellation without starting capture", async () => {
  const state = setup();
  let resolve!: (value: unknown) => void;
  state.request.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = state.voice.record(state.port, target);
  await Promise.resolve();
  state.voice.cancel(); resolve({ lease: "late-lease" });
  await pending;
  expect(state.capture.start).not.toHaveBeenCalled();
  expect(state.request).toHaveBeenLastCalledWith("voice.local.release", { lease: "late-lease" }, expect.anything());
});

it("cleans up and becomes usable after authority is revoked while Host startup is pending", async () => {
  const state = setup();
  let resolve!: (value: unknown) => void;
  state.request.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = state.voice.record(state.port, target);
  await Promise.resolve();
  state.revoke(); resolve({ lease: "late-lease" }); await pending;
  expect(state.capture.start).not.toHaveBeenCalled();
  expect(state.capture.stop).toHaveBeenCalled();
  expect(state.dependencies.state).toHaveBeenLastCalledWith("idle", target);
  expect(state.request).toHaveBeenLastCalledWith("voice.local.release", { lease: "late-lease" }, expect.anything());
  state.restore(); await state.voice.record(state.port, target);
  expect(state.capture.start).toHaveBeenCalledTimes(1);
  state.voice.cancel();
});

it("drops transcription after access revocation and never sends a Room message", async () => {
  const state = setup();
  await state.voice.record(state.port, target); state.buffer(new Int16Array(3200));
  state.revoke(); await state.voice.finish();
  expect(state.dependencies.transcript).not.toHaveBeenCalled();
  expect(state.request.mock.calls.some(([method]) => method === "voice.local.transcribe")).toBe(false);
});

it("holds one recording and bounds it to 30 seconds even if native buffers are oversized", async () => {
  const state = setup();
  await state.voice.record(state.port, target);
  await state.voice.record(state.port, { ...target, threadId: "different-thread" });
  expect(state.capture.start).toHaveBeenCalledTimes(1);
  state.buffer(new Int16Array(600000));
  await Promise.resolve(); await Promise.resolve();
  const payload = state.request.mock.calls.find(([method]) => method === "voice.local.transcribe") as unknown as [string, { audio: string }];
  expect(atob(payload[1].audio)).toHaveLength(960000);
  state.voice.cancel();
});

it("does not publish a result when access changes during transcription", async () => {
  const state = setup();
  await state.voice.record(state.port, target); state.buffer(new Int16Array(3200));
  let resolve!: (value: unknown) => void;
  state.request.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = state.voice.finish();
  state.revoke(); resolve({ text: "stale private transcript" }); await pending;
  expect(state.dependencies.transcript).not.toHaveBeenCalled();
});

it("keeps emoji and combining graphemes whole at the synthesizer's per-utterance limit", () => {
  const text = "x".repeat(699) + "👩🏽‍💻" + "á" + "More";
  const parts = speechParts(text);
  expect(parts.join("")).toBe(text);
  expect(parts.every(part => part.length <= 700)).toBe(true);
  expect(parts[1]).toContain("👩🏽‍💻");
});

it("reports a completed Host reply with no audio as a playback failure", async () => {
  const state = setup();
  state.request
    .mockResolvedValueOnce({ lease: "speech-lease" })
    .mockResolvedValueOnce({ id: "speech-id" })
    .mockResolvedValueOnce({ done: true });
  await state.voice.speak(state.port, target, "Read this reply");
  expect(state.dependencies.play).not.toHaveBeenCalled();
  expect(state.dependencies.error).toHaveBeenCalledWith(new Error("The computer returned no speech audio."));
  expect(state.request).toHaveBeenLastCalledWith("voice.local.release", { lease: "speech-lease" }, expect.anything());
});

it("keeps the Host speech lease alive during long native playback and releases it afterward", async () => {
  vi.useFakeTimers();
  const state = setup();
  let finishPlayback!: () => void;
  state.dependencies.play.mockImplementationOnce(() => new Promise<void>(resolve => { finishPlayback = resolve; }));
  state.request
    .mockResolvedValueOnce({ lease: "speech-lease" })
    .mockResolvedValueOnce({ id: "speech-id" })
    .mockResolvedValueOnce({ audio: "AAA=", sampleRate: 16000 })
    .mockResolvedValueOnce({ done: true });
  try {
    const pending = state.voice.speak(state.port, target, "Read this reply");
    await vi.waitFor(() => expect(state.dependencies.play).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(30000);
    expect(state.request).toHaveBeenCalledWith("voice.local.keepAlive", { lease: "speech-lease" }, expect.anything());
    finishPlayback(); await pending;
    expect(state.request).toHaveBeenLastCalledWith("voice.local.release", { lease: "speech-lease" }, expect.anything());
  } finally { state.voice.cancel(); vi.useRealTimers(); }
});

it("call-mode VAD finishes sustained speech after silence but dictation remains manual", async () => {
  const call = setup(); await call.voice.record(call.port, target, { endOnSilence: true });
  call.buffer(Int16Array.from({ length: 4800 }, (_, index) => 2400 * Math.sin(index * Math.PI / 40)));
  // One second is still within the desktop's natural 1.2 s pause; the turn ends once it has passed.
  call.buffer(new Int16Array(16000));
  expect(call.dependencies.transcript).not.toHaveBeenCalled();
  call.buffer(new Int16Array(6400));
  await vi.waitFor(() => expect(call.dependencies.transcript).toHaveBeenCalledWith(target, "Review the current project"));
  const manual = setup(); await manual.voice.record(manual.port, target);
  manual.buffer(new Int16Array(4800).fill(1500)); manual.buffer(new Int16Array(16000));
  expect(manual.dependencies.transcript).not.toHaveBeenCalled(); manual.voice.cancel();
});
it("call-mode silence settles empty without asking transcription to hallucinate speech", async () => {
  const state = setup(); await state.voice.record(state.port, target, { endOnSilence: true });
  state.buffer(new Int16Array(128000));
  await vi.waitFor(() => expect(state.dependencies.transcript).toHaveBeenCalledWith(target, ""));
  expect(state.request.mock.calls.some(([method]) => method === "voice.local.transcribe")).toBe(false);
  expect(state.dependencies.error).not.toHaveBeenCalled();
});
it("native limit finishes valid capture and ignores synchronous intentional stop notification", async () => {
  const state = setup(); await state.voice.record(state.port, target);
  state.capture.stop.mockImplementation(() => state.ended("service-stop"));
  state.buffer(new Int16Array(3200).fill(1000)); state.ended("limit");
  await vi.waitFor(() => expect(state.dependencies.transcript).toHaveBeenCalledOnce());
  expect(state.dependencies.error).not.toHaveBeenCalled(); expect(state.capture.stop).toHaveBeenCalledOnce();
});
it("unexpected native service shutdown cancels capture and reports an error without transcription", async () => {
  const state = setup(); await state.voice.record(state.port, target); state.buffer(new Int16Array(3200)); state.ended("service-stop", "Native service ended");
  expect(state.capture.stop).toHaveBeenCalled(); expect(state.dependencies.error).toHaveBeenCalledWith(new Error("Native service ended"));
  expect(state.dependencies.transcript).not.toHaveBeenCalled(); expect(state.dependencies.state).toHaveBeenLastCalledWith("idle", target);
});

it("cuts the first reply part at a word boundary so playback can start sooner", () => {
  const parts = speechParts("word ".repeat(100).trimEnd());
  expect(parts.length).toBeGreaterThan(1);
  expect(parts[0]!.length).toBeLessThanOrEqual(160);
  expect(parts[0]!.endsWith(" ")).toBe(true);
  expect(parts.join("")).toBe("word ".repeat(100).trimEnd());
});

it("synthesizes the next reply part while the current one plays, in order", async () => {
  const state = setup();
  const polled = new Set<string>();
  let ids = 0;
  let finishFirst!: () => void;
  state.dependencies.play.mockImplementationOnce(() => new Promise<void>(resolve => { finishFirst = resolve; }));
  state.request.mockImplementation(async (method: string, params?: { id?: string }): Promise<unknown> => {
    if (method === "voice.local.start") return { lease: "speech-lease" };
    if (method === "voice.local.speak") return { id: `speech-${++ids}` };
    if (method === "voice.local.speechNext") {
      if (polled.has(params!.id!)) return { done: true };
      polled.add(params!.id!); return { audio: "AAAA", sampleRate: 16000 };
    }
    return {};
  });
  const pending = state.voice.speak(state.port, target, "word ".repeat(100).trimEnd());
  await vi.waitFor(() => expect(state.dependencies.play).toHaveBeenCalledTimes(1));
  const speaks = state.request.mock.calls.filter(([method]) => method === "voice.local.speak");
  expect(speaks).toHaveLength(2);
  expect(speaks[0]?.[1]?.text?.length).toBeLessThanOrEqual(160);
  finishFirst();
  await pending;
  expect(state.dependencies.play).toHaveBeenCalledTimes(2);
  expect(state.dependencies.error).not.toHaveBeenCalled();
  expect(state.request).toHaveBeenLastCalledWith("voice.local.release", { lease: "speech-lease" }, expect.anything());
});

it("streams the first PCM chunk before the Host signals the end of synthesis", async () => {
  const state = setup();
  const first = { audio: "AAA=", sampleRate: 16000 };
  const played: SpeechChunk[] = [];
  const playStream = vi.fn(async (chunks: AsyncIterable<SpeechChunk>) => {
    for await (const chunk of chunks) played.push(chunk);
  });
  Object.assign(state.dependencies, { playStream });
  let complete!: (value: { done: true }) => void;
  state.request
    .mockResolvedValueOnce({ lease: "speech-lease" })
    .mockResolvedValueOnce({ id: "first" })
    .mockResolvedValueOnce(first)
    .mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const pending = state.voice.speak(state.port, target, "Read this reply");
  await vi.waitFor(() => expect(played).toEqual([first]));
  expect(state.dependencies.play).not.toHaveBeenCalled();
  complete({ done: true });
  await pending;
  expect(playStream).toHaveBeenCalledOnce();
  expect(state.dependencies.error).not.toHaveBeenCalled();
});

it("keeps the original cloud provider and model for the whole utterance", async () => {
  const state = setup();
  const engine = vi.fn().mockReturnValue("openai");
  const cloudModel = vi.fn().mockReturnValue("gpt-4o-mini-transcribe");
  Object.assign(state.dependencies, { engine, cloudModel });
  state.request.mockResolvedValue({ text: "Recognized speech" });
  await state.voice.record(state.port, target);
  engine.mockReturnValue("xai");
  cloudModel.mockReturnValue(undefined);
  state.buffer(new Int16Array(3200).fill(1000));
  await state.voice.finish();
  expect(state.request).toHaveBeenCalledExactlyOnceWith("voice.cloud.transcribe", {
    provider: "openai", model: "gpt-4o-mini-transcribe", audio: expect.any(String),
  }, expect.anything());
  expect(state.dependencies.transcript).toHaveBeenCalledWith(target, "Recognized speech");
});

it("attributes each failure to the chain step that was running", async () => {
  const transcription = setup(), stage = vi.fn();
  Object.assign(transcription.dependencies, { stage });
  transcription.request.mockImplementation(async (method: string) => {
    if (method === "voice.local.start") return { lease: "lease-one" };
    if (method === "voice.local.transcribe") throw new Error("Model file missing");
    return {};
  });
  await transcription.voice.record(transcription.port, target);
  expect(stage.mock.calls.map(([value]) => value)).toEqual(["microphone", "transcription", "microphone"]);
  transcription.buffer(new Int16Array(3200).fill(1000));
  await transcription.voice.finish();
  expect(stage).toHaveBeenLastCalledWith("transcription");
  expect(transcription.dependencies.error).toHaveBeenCalledWith(new Error("Model file missing"));

  const microphone = setup(), micStage = vi.fn();
  Object.assign(microphone.dependencies, { stage: micStage });
  await microphone.voice.record(microphone.port, target); microphone.ended("service-stop", "Native service ended");
  expect(micStage).toHaveBeenLastCalledWith("microphone");

  const playback = setup(), playStage = vi.fn();
  Object.assign(playback.dependencies, { stage: playStage });
  playback.dependencies.play.mockRejectedValueOnce(new Error("Audio output busy"));
  playback.request
    .mockResolvedValueOnce({ lease: "speech-lease" })
    .mockResolvedValueOnce({ id: "speech-id" })
    .mockResolvedValueOnce({ audio: "AAAA", sampleRate: 16000 })
    .mockResolvedValueOnce({ done: true });
  await playback.voice.speak(playback.port, target, "Read this reply");
  expect(playStage.mock.calls.map(([value]) => value)).toEqual(["synthesis", "synthesis", "playback"]);
  expect(playback.dependencies.error).toHaveBeenCalledWith(new Error("Audio output busy"));
});
