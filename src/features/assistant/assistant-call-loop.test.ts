import { afterEach, expect, it, vi } from "vitest";
import { AssistantCallLoop, AssistantUtteranceVad } from "./assistant-call-loop";
const target = { machineId: "host", environmentId: "env", threadId: "room" };
const deferred = <T>() => { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function setup() {
  let allowed = true;
  const audio = deferred<string>();
  const deps = { capture: vi.fn(() => audio.promise), send: vi.fn(async () => "Admitted reply"), speak: vi.fn(async () => {}), cancelAudio: vi.fn(), current: () => allowed, state: vi.fn(), error: vi.fn() };
  return { loop: new AssistantCallLoop(deps), deps, audio, revoke: () => { allowed = false; } };
}
afterEach(() => vi.useRealTimers());
it("loops one captured target through admitted send and playback without parallel captures", async () => {
  const s = setup(), next = deferred<string>(); s.deps.capture.mockImplementationOnce(() => s.audio.promise).mockImplementation(() => next.promise);
  const mutable = { ...target }; expect(s.loop.start(mutable)).toBe(true); mutable.threadId = "replacement";
  expect(s.loop.start({ ...target, threadId: "other" })).toBe(false);
  s.audio.resolve("Recognized phrase");
  await vi.waitFor(() => expect(s.deps.capture).toHaveBeenCalledTimes(2));
  expect(s.deps.send).toHaveBeenCalledWith("Recognized phrase", target, expect.any(Function));
  expect(s.deps.speak).toHaveBeenCalledWith("Admitted reply", target, expect.any(Function));
  expect(s.deps.state.mock.calls.map(call => call[0])).toEqual(["listening", "sending", "speaking", "listening"]);
  s.loop.stop(); next.resolve("");
});
it("stops on unknown send and never retries or starts playback", async () => {
  const s = setup(); const error = new Error("delivery unknown"); s.deps.send.mockRejectedValueOnce(error);
  s.loop.start(target); s.audio.resolve("Send once");
  await vi.waitFor(() => expect(s.deps.error).toHaveBeenCalledWith(error));
  expect(s.deps.send).toHaveBeenCalledTimes(1); expect(s.deps.speak).not.toHaveBeenCalled(); expect(s.loop.current()).toBe(false);
});
it("mute cancels audio, waits for unsettled capture, and resumes only one new listener", async () => {
  const s = setup(), next = deferred<string>(); s.deps.capture.mockImplementationOnce(() => s.audio.promise).mockImplementation(() => next.promise);
  s.loop.start(target); s.loop.setMuted(true); s.loop.setMuted(false);
  expect(s.deps.capture).toHaveBeenCalledTimes(1); expect(s.deps.cancelAudio).toHaveBeenCalledOnce();
  s.audio.resolve("Discard muted capture");
  await vi.waitFor(() => expect(s.deps.capture).toHaveBeenCalledTimes(2));
  expect(s.deps.send).not.toHaveBeenCalled(); s.loop.stop(); next.resolve("");
});
it("revoked targets cancel and reject late capture/send results", async () => {
  const s = setup(); s.loop.start(target); s.revoke(); expect(s.loop.current()).toBe(false);
  s.audio.resolve("Private late phrase"); await Promise.resolve();
  expect(s.deps.cancelAudio).toHaveBeenCalled(); expect(s.deps.send).not.toHaveBeenCalled();
});
it("keeps silence listening for 180 seconds with backoff and no sends", async () => {
  vi.useFakeTimers(); const s = setup(); s.deps.capture.mockResolvedValue(""); s.loop.start(target);
  await vi.advanceTimersByTimeAsync(179500);
  expect(s.loop.current()).toBe(true); expect(s.deps.error).not.toHaveBeenCalled();
  expect(s.deps.capture).toHaveBeenCalledTimes(360);
  await vi.advanceTimersByTimeAsync(500);
  expect(s.deps.capture).toHaveBeenCalledTimes(361); expect(s.deps.send).not.toHaveBeenCalled(); expect(s.loop.current()).toBe(false); expect(s.deps.error).toHaveBeenCalledOnce();
});
it("does not resume capture while a muted send is still settling", async () => {
  const s = setup(), send = deferred<string>(), next = deferred<string>(); s.deps.send.mockImplementation(() => send.promise); s.deps.capture.mockImplementationOnce(() => s.audio.promise).mockImplementation(() => next.promise);
  s.loop.start(target); s.audio.resolve("Once"); await vi.waitFor(() => expect(s.deps.send).toHaveBeenCalledOnce());
  s.loop.setMuted(true); s.loop.setMuted(false); expect(s.deps.capture).toHaveBeenCalledTimes(1);
  send.resolve("Late admitted reply"); await vi.waitFor(() => expect(s.deps.capture).toHaveBeenCalledTimes(2));
  expect(s.deps.speak).toHaveBeenCalledOnce(); s.loop.stop(); next.resolve("");
});
it("keeps the pending reply and playback active while the microphone is muted", async () => {
  const s = setup(), send = deferred<string>(), playback = deferred<void>();
  s.deps.send.mockImplementation(() => send.promise);
  s.deps.speak.mockImplementation(() => playback.promise);
  s.loop.start(target); s.audio.resolve("Once");
  await vi.waitFor(() => expect(s.deps.state).toHaveBeenLastCalledWith("sending", target));
  s.loop.setMuted(true);
  expect(s.deps.state).toHaveBeenLastCalledWith("sending", target);
  send.resolve("Admitted reply");
  await vi.waitFor(() => expect(s.deps.state).toHaveBeenLastCalledWith("speaking", target));
  s.loop.setMuted(false); s.loop.setMuted(true);
  expect(s.deps.cancelAudio).not.toHaveBeenCalled();
  playback.resolve();
  await vi.waitFor(() => expect(s.deps.state).toHaveBeenLastCalledWith("muted", target));
  expect(s.deps.capture).toHaveBeenCalledOnce();
  s.loop.stop();
});
it("VAD requires sustained speech followed by silence and never calls silence speech", () => {
  const vad = new AssistantUtteranceVad(); const frame = (value: number, ms: number) => new Int16Array(ms * 16).fill(value);
  const voiced = (ms: number) => Int16Array.from({ length: ms * 16 }, (_, i) => 2400 * Math.sin(i * Math.PI / 40));
  expect(vad.push(frame(0, 8000))).toBe(true); expect(vad.hasSpeech).toBe(false);
  const speech = new AssistantUtteranceVad(); expect(speech.push(voiced(100))).toBe(false); expect(speech.hasSpeech).toBe(false);
  expect(speech.push(voiced(200))).toBe(false); expect(speech.hasSpeech).toBe(true);
  expect(speech.push(frame(50, 500))).toBe(false); expect(speech.push(frame(50, 500))).toBe(false);
  // The desktop's natural pause: 1.2 s of silence ends the turn, not the former 0.9 s.
  expect(speech.push(frame(50, 300))).toBe(true);
});
it("honors the chosen pause and the owner's own turn end", () => {
  const frame = (value: number, ms: number) => new Int16Array(ms * 16).fill(value);
  const voiced = (ms: number) => Int16Array.from({ length: ms * 16 }, (_, i) => 2400 * Math.sin(i * Math.PI / 40));
  const longer = new AssistantUtteranceVad({ endSilence: 2.5 });
  longer.push(voiced(300)); expect(longer.hasSpeech).toBe(true);
  expect(longer.push(frame(50, 2000))).toBe(false); expect(longer.push(frame(50, 600))).toBe(true);
  // "I decide when my turn ends": long silence keeps listening; only Send now commits.
  const manual = new AssistantUtteranceVad({ manualTurnEnd: true });
  manual.push(voiced(300)); expect(manual.hasSpeech).toBe(true);
  expect(manual.push(frame(50, 6000))).toBe(false);
});
it("rejects microphone crackle and DC offset despite their high amplitude", () => {
  const vad = new AssistantUtteranceVad();
  let seed = 3;
  const crackle = Int16Array.from({ length: 16000 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return 6000 * (seed / 2 ** 31 - 1);
  });
  expect(vad.push(crackle)).toBe(false);
  expect(vad.push(new Int16Array(16000).fill(3000))).toBe(false);
  expect(vad.hasSpeech).toBe(false);
  expect(vad.push(new Int16Array(96000))).toBe(true);
  expect(vad.hasSpeech).toBe(false);
});

it("unknown send still stops the call when mute invalidated its audio epoch", async () => {
  const s = setup(), send = deferred<string>(); s.deps.send.mockImplementation(() => send.promise);
  s.loop.start(target); s.audio.resolve("Send once"); await vi.waitFor(() => expect(s.deps.send).toHaveBeenCalledOnce());
  s.loop.setMuted(true); s.loop.setMuted(false); const error = new Error("delivery unknown"); send.reject(error);
  await vi.waitFor(() => expect(s.deps.error).toHaveBeenCalledWith(error));
  expect(s.loop.current()).toBe(false); expect(s.deps.capture).toHaveBeenCalledTimes(1); expect(s.deps.speak).not.toHaveBeenCalled();
});

it("stop during playback cancels audio and cannot restart after late completion", async () => {
  const s = setup(), playback = deferred<void>(); s.deps.speak.mockImplementation(() => playback.promise);
  s.loop.start(target); s.audio.resolve("One utterance"); await vi.waitFor(() => expect(s.deps.speak).toHaveBeenCalledOnce());
  s.loop.stop(); expect(s.deps.cancelAudio).toHaveBeenCalledOnce(); playback.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(s.deps.capture).toHaveBeenCalledTimes(1); expect(s.loop.current()).toBe(false);
});
it("stop during durable admission never repeats the send or reads its late reply", async () => {
  const s = setup(), send = deferred<string>(); s.deps.send.mockImplementation(() => send.promise);
  s.loop.start(target); s.audio.resolve("One utterance"); await vi.waitFor(() => expect(s.deps.send).toHaveBeenCalledOnce());
  s.loop.stop(); send.resolve("Late reply"); await Promise.resolve(); await Promise.resolve();
  expect(s.deps.send).toHaveBeenCalledTimes(1); expect(s.deps.speak).not.toHaveBeenCalled(); expect(s.loop.current()).toBe(false);
});

it("restarts the idle window at unmute instead of anchoring it to the pre-mute utterance", async () => {
  vi.useFakeTimers(); const s = setup(); s.deps.capture.mockResolvedValue(""); s.loop.start(target);
  await vi.advanceTimersByTimeAsync(120000);
  s.deps.capture.mockResolvedValueOnce("Still here");
  await vi.advanceTimersByTimeAsync(500);
  expect(s.deps.send).toHaveBeenCalledOnce();
  s.loop.setMuted(true); await vi.advanceTimersByTimeAsync(500); s.loop.setMuted(false);
  await vi.advanceTimersByTimeAsync(179500);
  expect(s.loop.current()).toBe(true); expect(s.deps.error).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(500);
  expect(s.loop.current()).toBe(false); expect(s.deps.send).toHaveBeenCalledOnce(); expect(s.deps.error).toHaveBeenCalledOnce();
});
it("a long mute does not end the call at the first quiet capture after unmute", async () => {
  vi.useFakeTimers(); const s = setup(); s.deps.capture.mockResolvedValue(""); s.loop.start(target);
  await vi.advanceTimersByTimeAsync(1000);
  s.loop.setMuted(true); const calls = s.deps.capture.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10 * 60000);
  // Muted: no listener runs, nothing is sent and the call stays open.
  expect(s.deps.capture).toHaveBeenCalledTimes(calls); expect(s.loop.current()).toBe(true); expect(s.deps.error).not.toHaveBeenCalled();
  s.loop.setMuted(false);
  await vi.advanceTimersByTimeAsync(1500);
  expect(s.deps.capture.mock.calls.length).toBeGreaterThan(calls);
  expect(s.loop.current()).toBe(true); expect(s.deps.error).not.toHaveBeenCalled(); expect(s.deps.send).not.toHaveBeenCalled();
});
it("unmute opens one listener only after the explicit unmute and a muted call never captures", async () => {
  vi.useFakeTimers(); const s = setup(); s.deps.capture.mockResolvedValue(""); s.loop.start(target);
  s.loop.setMuted(true); await vi.advanceTimersByTimeAsync(0); const muted = s.deps.capture.mock.calls.length;
  await vi.advanceTimersByTimeAsync(4 * 60000); expect(s.deps.capture).toHaveBeenCalledTimes(muted);
  s.loop.setMuted(true); expect(s.deps.capture).toHaveBeenCalledTimes(muted);
  s.loop.setMuted(false); await vi.advanceTimersByTimeAsync(0);
  expect(s.deps.capture).toHaveBeenCalledTimes(muted + 1); s.loop.stop();
});
it("stop during silence backoff clears its timer without another capture", async () => {
  vi.useFakeTimers(); const s = setup(); s.deps.capture.mockResolvedValue(""); s.loop.start(target);
  await vi.advanceTimersByTimeAsync(1000); const calls = s.deps.capture.mock.calls.length;
  s.loop.stop(); await vi.advanceTimersByTimeAsync(180000);
  expect(s.deps.capture).toHaveBeenCalledTimes(calls); expect(s.deps.error).not.toHaveBeenCalled();
});
it("interrupt stops only the spoken reply and returns to one new listener without an error", async () => {
  const s = setup(), playback = deferred<void>(), next = deferred<string>();
  s.deps.capture.mockImplementationOnce(() => s.audio.promise).mockImplementation(() => next.promise);
  s.deps.speak.mockImplementationOnce(() => playback.promise);
  s.loop.start(target);
  expect(s.loop.interrupt()).toBe(false);
  s.audio.resolve("Tell me");
  await vi.waitFor(() => expect(s.deps.speak).toHaveBeenCalledOnce());
  expect(s.loop.interrupt()).toBe(true); expect(s.deps.cancelAudio).toHaveBeenCalledOnce();
  playback.reject(new Error("Playback canceled."));
  await vi.waitFor(() => expect(s.deps.capture).toHaveBeenCalledTimes(2));
  expect(s.deps.error).not.toHaveBeenCalled(); expect(s.loop.current()).toBe(true); expect(s.deps.send).toHaveBeenCalledOnce();
  s.loop.stop(); next.resolve("");
});
it("a muted speaker keeps sending and listening but never plays replies", async () => {
  const s = setup(), next = deferred<string>();
  s.deps.capture.mockImplementationOnce(() => s.audio.promise).mockImplementation(() => next.promise);
  s.loop.start(target); s.loop.setSpeakerMuted(true);
  s.audio.resolve("Quiet please");
  await vi.waitFor(() => expect(s.deps.capture).toHaveBeenCalledTimes(2));
  expect(s.deps.send).toHaveBeenCalledOnce(); expect(s.deps.speak).not.toHaveBeenCalled();
  expect(s.deps.state.mock.calls.map(call => call[0])).toEqual(["listening", "sending", "listening"]);
  s.loop.stop(); next.resolve("");
});
