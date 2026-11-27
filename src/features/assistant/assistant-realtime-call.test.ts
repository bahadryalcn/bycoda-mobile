import { expect, it, vi } from "vitest";
import { AssistantRealtimeCall, realtimeCallProvider, type RealtimeAudio, type RealtimeCallPort } from "./assistant-realtime-call";
import { AssistantCallError } from "./assistant-call-error";
import type { VoiceRelayNextResult } from "../../../../src/shared/model/host-contracts/voice";

const target = { machineId: "machine", environmentId: "env", threadId: "room-1" };
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/** A voice socket whose `voice.realtime.next` answers come from the test, one poll at a time. */
function fakePort() {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const polls: ((value: VoiceRelayNextResult) => void)[] = [];
  const port: RealtimeCallPort = {
    request: vi.fn(async <T,>(method: string, params: Record<string, unknown>) => {
      calls.push({ method, params });
      if (method === "voice.realtime.start") return { lease: "lease-1", inRate: 16000, outRate: 24000 } as T;
      if (method === "voice.realtime.next") return new Promise<T>(resolve => polls.push(resolve as never));
      return { accepted: true } as T;
    }) as RealtimeCallPort["request"],
  };
  const answer = async (value: Partial<VoiceRelayNextResult>) => {
    for (let i = 0; i < 20 && !polls.length; i++) await flush();
    polls.shift()!({ chunks: [], events: [], cursor: 0, ...value });
    await flush(); await flush();
  };
  return { port, calls, answer, sent: (method: string) => calls.filter(call => call.method === method) };
}

function fakeAudio() {
  const state = { onPcm: undefined as ((pcm: Int16Array) => void) | undefined, captures: 0, stops: 0, appended: [] as string[], finished: 0, playerStops: 0, finish: undefined as (() => void) | undefined };
  const audio: RealtimeAudio = {
    capture: vi.fn(async (onPcm: (pcm: Int16Array) => void) => {
      state.captures++; state.onPcm = onPcm;
      return { stop: () => { state.stops++; state.onPcm = undefined; } };
    }),
    player: () => ({
      append: audio => { state.appended.push(audio); },
      finish: () => new Promise<void>(resolve => { state.finished++; state.finish = resolve; }),
      stop: () => { state.playerStops++; },
    }),
  };
  return { audio, state };
}

function call(provider: "xai" | "openai" = "openai") {
  const port = fakePort(), audio = fakeAudio();
  const phases: string[] = [], transcripts: [string, string][] = [], errors: unknown[] = [];
  let now = 1000;
  const realtime = new AssistantRealtimeCall({
    port: port.port, audio: audio.audio, provider, language: "tr", projectId: "project-1", current: () => true,
    state: phase => phases.push(phase), transcript: (role, text) => transcripts.push([role, text]), error: error => errors.push(error),
    now: () => now,
  });
  return { realtime, port, audio, phases, transcripts, errors, advance: (ms: number) => { now += ms; } };
}

const pcm = () => new Int16Array(1600).fill(1200);

it("relays only when the computer advertises it, the mode is realtime and its provider is signed in", async () => {
  const request = vi.fn();
  const port = { request } as unknown as RealtimeCallPort;
  await expect(realtimeCallProvider(["voice.local.v1"], port)).resolves.toBeUndefined();
  expect(request).not.toHaveBeenCalled();
  const caps = ["voice.realtime.relay.v1"];
  request.mockResolvedValueOnce({ settings: { mode: "grok" }, signedIn: { grok: true, openai: false } });
  await expect(realtimeCallProvider(caps, port)).resolves.toBe("xai");
  request.mockResolvedValueOnce({ settings: { mode: "openai" }, signedIn: { grok: true, openai: false } });
  await expect(realtimeCallProvider(caps, port)).resolves.toBeUndefined();
  request.mockResolvedValueOnce({ settings: { mode: "local" }, signedIn: { grok: true, openai: true } });
  await expect(realtimeCallProvider(caps, port)).resolves.toBeUndefined();
  expect(request).toHaveBeenCalledWith("voice.call.settings.get", {}, expect.anything());
});

it("streams the microphone, plays the reply with the microphone closed, then listens again", async () => {
  const { realtime, port, audio, phases, transcripts } = call();
  expect(realtime.start(target)).toBe(true);
  await flush(); await flush();
  expect(port.sent("voice.realtime.start")[0]!.params).toEqual({ threadId: "room-1", provider: "openai", language: "tr", projectId: "project-1" });
  expect(phases.at(-1)).toBe("listening");
  audio.state.onPcm!(pcm()); audio.state.onPcm!(pcm());
  await flush();
  expect(port.sent("voice.realtime.audio").map(call => call.params.seq)).toEqual([0, 1]);
  expect(port.sent("voice.realtime.audio")[0]!.params).toMatchObject({ lease: "lease-1", audio: expect.any(String) });
  await port.answer({
    events: [{ type: "state", at: 1, state: "thinking" }, { type: "user_transcript", at: 2, text: "Durum ne?" }],
    cursor: 2,
  });
  expect(phases.at(-1)).toBe("sending");
  expect(transcripts).toEqual([["user", "Durum ne?"]]);
  await port.answer({
    chunks: [{ at: 3, audio: "AAAA", responseId: "resp-1" }, { at: 5, audio: "BBBB", responseId: "resp-1" }],
    events: [{ type: "state", at: 4, state: "speaking" }, { type: "assistant_transcript", at: 6, text: "İki oturum çalışıyor.", responseId: "resp-1" }],
    cursor: 6,
  });
  expect(audio.state.appended).toEqual(["AAAA", "BBBB"]);
  expect(phases.at(-1)).toBe("speaking");
  expect(audio.state.stops).toBe(1);
  expect(transcripts.at(-1)).toEqual(["assistant", "İki oturum çalışıyor."]);
  expect(port.sent("voice.realtime.next").at(-1)!.params).toEqual({ lease: "lease-1", cursor: 6 });
  await port.answer({ events: [{ type: "state", at: 7, state: "listening" }], cursor: 7 });
  // The reply is still playing out: no capture yet.
  expect(audio.state.captures).toBe(1);
  audio.state.finish!();
  await flush(); await flush();
  expect(audio.state.captures).toBe(2);
  expect(phases.at(-1)).toBe("listening");
  realtime.stop();
  await flush();
  expect(port.sent("voice.realtime.end")[0]!.params).toEqual({ lease: "lease-1" });
  expect(phases.at(-1)).toBe("idle");
});

it("a tap interrupts the reply, reports what was heard and drops its late audio", async () => {
  const { realtime, port, audio, phases, advance } = call();
  realtime.start(target);
  await flush(); await flush();
  await port.answer({ chunks: [{ at: 1, audio: "A".repeat(9600), responseId: "resp-1" }], cursor: 1 });
  expect(phases.at(-1)).toBe("speaking");
  advance(80);
  expect(realtime.interrupt()).toBe(true);
  await flush();
  expect(audio.state.playerStops).toBe(1);
  expect(port.sent("voice.realtime.interrupt")[0]!.params).toEqual({ lease: "lease-1", playedMs: 80 });
  expect(phases.at(-1)).toBe("listening");
  await port.answer({ chunks: [{ at: 2, audio: "CCCC", responseId: "resp-1" }], events: [{ type: "interrupted", at: 3 }], cursor: 3 });
  expect(audio.state.appended).toEqual(["A".repeat(9600)]);
  expect(realtime.interrupt()).toBe(false);
  realtime.stop();
});

it("does not send audio while muted and ends with the computer's reason", async () => {
  const { realtime, port, audio, phases, errors } = call("xai");
  realtime.start(target);
  await flush(); await flush();
  realtime.setMuted(true);
  expect(phases.at(-1)).toBe("muted");
  expect(audio.state.stops).toBe(1);
  realtime.setMuted(false);
  await flush();
  expect(audio.state.captures).toBe(2);
  audio.state.onPcm!(pcm());
  await flush();
  expect(port.sent("voice.realtime.audio")).toHaveLength(1);
  await port.answer({ events: [{ type: "ended", at: 1, reason: "idle" }], cursor: 1 });
  expect(errors).toHaveLength(1);
  expect(errors[0]).toBeInstanceOf(AssistantCallError);
  expect((errors[0] as AssistantCallError).reason).toBe("idle-timeout");
  expect(phases.at(-1)).toBe("idle");
});

/** A device with echo cancellation: the microphone stays open over a reply whose played position the test sets. */
function duplexCall(granted: boolean | Error = true, relayV2 = true) {
  const port = fakePort(), audio = fakeAudio();
  const phases: string[] = [], spoken: boolean[] = [];
  let played = 0;
  const player = audio.audio.player;
  audio.audio.player = () => ({ ...player(), playedMs: () => played });
  audio.audio.duplex = vi.fn(async () => { if (granted instanceof Error) throw granted; return granted; });
  const realtime = new AssistantRealtimeCall({
    port: port.port, audio: audio.audio, provider: "openai", language: "tr", relayV2, current: () => true,
    state: phase => phases.push(phase), error: () => {}, spokenInterrupt: available => spoken.push(available),
  });
  return { realtime, port, audio, phases, spoken, play: (ms: number) => { played = ms; } };
}

it("in full duplex keeps streaming the microphone over a reply and reports how much of it was heard", async () => {
  const { realtime, port, audio, phases, spoken, play } = duplexCall();
  realtime.start(target);
  await flush(); await flush(); await flush();
  expect(audio.audio.duplex).toHaveBeenCalledTimes(1);
  expect(spoken).toEqual([true]);
  expect(realtime.spokenInterrupt).toBe(true);
  audio.state.onPcm!(pcm());
  await flush();
  expect(port.sent("voice.realtime.audio")[0]!.params).not.toHaveProperty("playedMs");
  // 9600 base64 chars = 7200 bytes = 150 ms at 24 kHz.
  await port.answer({ chunks: [{ at: 1, audio: "A".repeat(9600), responseId: "resp-1" }], cursor: 1 });
  expect(phases.at(-1)).toBe("speaking");
  expect(audio.state.stops).toBe(0);
  play(90);
  audio.state.onPcm!(pcm());
  await flush();
  expect(port.sent("voice.realtime.audio").at(-1)!.params).toMatchObject({ seq: 1, playedMs: 90 });
  // A second response in the same player counts from its own start.
  await port.answer({ chunks: [{ at: 2, audio: "B".repeat(9600), responseId: "resp-2" }], cursor: 2 });
  play(200);
  audio.state.onPcm!(pcm());
  await flush();
  expect(port.sent("voice.realtime.audio").at(-1)!.params).toMatchObject({ playedMs: 50 });
  realtime.stop();
});

it("flushes the reply at once when the computer reports that the user spoke over it", async () => {
  const { realtime, port, audio, phases, play } = duplexCall();
  realtime.start(target);
  await flush(); await flush(); await flush();
  await port.answer({ chunks: [{ at: 1, audio: "A".repeat(9600), responseId: "resp-1" }], cursor: 1 });
  play(60);
  await port.answer({
    chunks: [{ at: 3, audio: "LATE", responseId: "resp-1" }],
    events: [{ type: "interrupted", at: 2 }, { type: "user_transcript", at: 4, text: "Dur" }], cursor: 4,
  });
  expect(audio.state.playerStops).toBe(1);
  expect(audio.state.appended).toEqual(["A".repeat(9600)]);
  expect(phases.at(-1)).toBe("listening");
  // The computer already cut its copy: no interrupt request, and the microphone never closed.
  expect(port.sent("voice.realtime.interrupt")).toHaveLength(0);
  expect(audio.state.captures).toBe(1);
  expect(audio.state.stops).toBe(0);
  audio.state.onPcm!(pcm());
  await flush();
  expect(port.sent("voice.realtime.audio").at(-1)!.params).not.toHaveProperty("playedMs");
  // A tap still interrupts in duplex, with the native played position.
  await port.answer({ chunks: [{ at: 5, audio: "C".repeat(9600), responseId: "resp-2" }], cursor: 5 });
  play(40);
  expect(realtime.interrupt()).toBe(true);
  await flush();
  expect(port.sent("voice.realtime.interrupt")[0]!.params).toEqual({ lease: "lease-1", playedMs: 40 });
  realtime.stop();
});

it("falls back to half duplex and tap-only interruption when the device has no echo cancellation", async () => {
  for (const granted of [false, new Error("unavailable")]) {
    const { realtime, port, audio, spoken } = duplexCall(granted);
    realtime.start(target);
    await flush(); await flush(); await flush();
    expect(spoken).toEqual([false]);
    expect(realtime.spokenInterrupt).toBe(false);
    await port.answer({ chunks: [{ at: 1, audio: "A".repeat(9600), responseId: "resp-1" }], cursor: 1 });
    // The microphone closes for the reply and nothing is sent over it.
    expect(audio.state.stops).toBe(1);
    expect(audio.state.onPcm).toBeUndefined();
    expect(port.sent("voice.realtime.audio")).toHaveLength(0);
    expect(realtime.interrupt()).toBe(true);
    realtime.stop();
  }
});

it("unmuting during a duplex reply reopens the microphone without leaving the reply", async () => {
  const { realtime, port, audio, phases } = duplexCall();
  realtime.start(target);
  await flush(); await flush(); await flush();
  realtime.setMuted(true);
  await port.answer({ chunks: [{ at: 1, audio: "A".repeat(9600), responseId: "resp-1" }], cursor: 1 });
  expect(phases.at(-1)).toBe("speaking");
  realtime.setMuted(false);
  await flush();
  expect(audio.state.captures).toBe(2);
  expect(phases.at(-1)).toBe("speaking");
  realtime.stop();
});

it("asks the device for echo cancellation before a v2 relay starts, and starts it with the answer", async () => {
  for (const [granted, duplex] of [[true, true], [false, false], [new Error("unavailable"), false]] as const) {
    const { realtime, port, audio } = duplexCall(granted);
    const order: string[] = [];
    const ask = audio.audio.duplex!;
    audio.audio.duplex = vi.fn(async () => { order.push("duplex"); return ask(); });
    const request = port.port.request;
    port.port.request = (async (method: string, params: Record<string, unknown>, options: never) => { order.push(method); return request(method, params, options); }) as RealtimeCallPort["request"];
    realtime.start(target);
    await flush(); await flush(); await flush();
    expect(order.slice(0, 2)).toEqual(["duplex", "voice.realtime.start"]);
    expect(port.sent("voice.realtime.start")[0]!.params).toEqual({ threadId: "room-1", provider: "openai", language: "tr", duplex });
    realtime.stop();
  }
});

it("keeps an older (v1) relay half duplex: no device request, no duplex on start and no playedMs", async () => {
  const { realtime, port, audio, spoken, play } = duplexCall(true, false);
  realtime.start(target);
  await flush(); await flush(); await flush();
  expect(audio.audio.duplex).not.toHaveBeenCalled();
  // Nothing to report on an older computer: the call screen shows no tap-to-interrupt hint.
  expect(spoken).toEqual([]);
  expect(port.sent("voice.realtime.start")[0]!.params).not.toHaveProperty("duplex");
  audio.state.onPcm!(pcm());
  await flush();
  expect(port.sent("voice.realtime.audio")[0]!.params).not.toHaveProperty("playedMs");
  await port.answer({ chunks: [{ at: 1, audio: "A".repeat(9600), responseId: "resp-1" }], cursor: 1 });
  // The microphone closes over the reply; only a tap interrupts.
  expect(audio.state.stops).toBe(1);
  play(70);
  expect(port.sent("voice.realtime.audio")).toHaveLength(1);
  expect(realtime.interrupt()).toBe(true);
  await flush();
  expect(port.sent("voice.realtime.interrupt")[0]!.params).toEqual({ lease: "lease-1", playedMs: 70 });
  realtime.stop();
});
