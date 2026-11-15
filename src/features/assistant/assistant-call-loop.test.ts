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
  send.resolve("Late admitted reply"); await vi.waitFor(() => expect(s.deps.capture).toHaveBeenCalledTimes(2)); expect(s.deps.speak).not.toHaveBeenCalled(); s.loop.stop(); next.resolve("");
});
it("VAD requires sustained speech followed by silence and never calls silence speech", () => {
  const vad = new AssistantUtteranceVad(); const frame = (value: number, ms: number) => new Int16Array(ms * 16).fill(value);
  expect(vad.push(frame(0, 8000))).toBe(true); expect(vad.hasSpeech).toBe(false);
  const speech = new AssistantUtteranceVad(); expect(speech.push(frame(1500, 100))).toBe(false); expect(speech.hasSpeech).toBe(false);
  expect(speech.push(frame(1500, 200))).toBe(false); expect(speech.hasSpeech).toBe(true);
  expect(speech.push(frame(50, 500))).toBe(false); expect(speech.push(frame(50, 500))).toBe(true);
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

it("anchors idle safety to the last recognized utterance across mute cycles", async () => {
  vi.useFakeTimers(); const s = setup(); s.deps.capture.mockResolvedValue(""); s.loop.start(target);
  await vi.advanceTimersByTimeAsync(120000);
  s.deps.capture.mockResolvedValueOnce("Still here");
  await vi.advanceTimersByTimeAsync(500);
  expect(s.deps.send).toHaveBeenCalledOnce();
  s.loop.setMuted(true); await vi.advanceTimersByTimeAsync(500); s.loop.setMuted(false);
  await vi.advanceTimersByTimeAsync(179000);
  expect(s.loop.current()).toBe(true);
  await vi.advanceTimersByTimeAsync(500);
  expect(s.loop.current()).toBe(false); expect(s.deps.send).toHaveBeenCalledOnce();
});
it("stop during silence backoff clears its timer without another capture", async () => {
  vi.useFakeTimers(); const s = setup(); s.deps.capture.mockResolvedValue(""); s.loop.start(target);
  await vi.advanceTimersByTimeAsync(1000); const calls = s.deps.capture.mock.calls.length;
  s.loop.stop(); await vi.advanceTimersByTimeAsync(180000);
  expect(s.deps.capture).toHaveBeenCalledTimes(calls); expect(s.deps.error).not.toHaveBeenCalled();
});
