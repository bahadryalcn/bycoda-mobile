import { pcmBase64 } from "../../../../src/shared/model/voice-realtime/voiceVad";
import {
  VOICE_REALTIME_RELAY_CAPABILITY,
  VOICE_RELAY_IN_RATE,
  VOICE_RELAY_OUT_RATE,
  type VoiceCallSettingsResult,
  type VoiceRelayEvent,
  type VoiceRelayNextResult,
} from "../../../../src/shared/model/host-contracts/voice";
import { AssistantCallError } from "./assistant-call-error";
import type { AssistantCallPhase } from "./assistant-call-loop";
import type { AssistantVoiceTarget } from "./assistant-voice";

/** 100 ms of 16 kHz PCM16 per native microphone event while a realtime call listens. */
export const REALTIME_BATCH_BYTES = 3200;
/** Uplink frames waiting for the computer; on a slower link newer frames are dropped instead of queued. */
const MAX_UPLINK_IN_FLIGHT = 6;
const NEXT_TIMEOUT_MS = 15_000;
const START_TIMEOUT_MS = 45_000;
type RealtimeProvider = "xai" | "openai";

export type RealtimeCallPort = {
  request<T>(method: string, params: Record<string, unknown>, options: { retry: false; timeoutMs: number }): Promise<T>;
};
/** One spoken reply on the phone's speaker. */
export type RealtimePlayer = {
  append(audio: string): void;
  finish(): Promise<void>;
  stop(): void;
  /** Milliseconds the speaker has actually played (underruns excluded), when the native player can tell. */
  playedMs?(): number;
};
export type RealtimeAudio = {
  /** 16 kHz capture in 100 ms events; `ended` reports a capture-scoped stop (time limit, mute, playback). */
  capture(onPcm: (pcm: Int16Array) => void, ended: (reason: string, error?: string) => void): Promise<{ stop(): void }>;
  player(): RealtimePlayer;
  /**
   * Asks the native session for full duplex with echo cancellation, before the first capture. True keeps
   * the microphone open while a reply plays; false (or a rejection) keeps half duplex.
   */
  duplex?(): Promise<boolean>;
};
export type AssistantRealtimeCallDependencies = {
  port: RealtimeCallPort;
  audio: RealtimeAudio;
  provider: RealtimeProvider;
  language: string;
  projectId?: string;
  /**
   * The computer advertises `voice.realtime.relay.v2`: it takes `duplex` on start and `playedMs` on audio.
   * An older relay rejects both fields, so without it the call stays half duplex with tap-to-interrupt.
   */
  relayV2?: boolean;
  current(): boolean;
  state(phase: AssistantCallPhase): void;
  level?(level: number): void;
  /** The words heard and spoken, for the call screen; never diagnostics. */
  transcript?(role: "user" | "assistant", text: string): void;
  /**
   * Once per call on a v2 relay, before it first listens: whether speaking interrupts a reply on this
   * device. False means no echo cancellation here, so only a tap interrupts. An older relay never reports.
   */
  spokenInterrupt?(available: boolean): void;
  error(error: unknown): void;
  now?(): number;
};

/**
 * The provider the computer should relay for this call, or none for the on-computer call. Only a Host
 * advertising the relay, set to Grok Voice or OpenAI Realtime and signed in to it, is relayed.
 */
export async function realtimeCallProvider(capabilities: readonly string[] | undefined, port: RealtimeCallPort): Promise<RealtimeProvider | undefined> {
  if (!capabilities?.includes(VOICE_REALTIME_RELAY_CAPABILITY)) return undefined;
  const result = await port.request<VoiceCallSettingsResult>("voice.call.settings.get", {}, { retry: false, timeoutMs: 10_000 });
  const mode = result?.settings?.mode;
  if (mode === "grok" && result.signedIn?.grok === true) return "xai";
  if (mode === "openai" && result.signedIn?.openai === true) return "openai";
  return undefined;
}

function endFailure(event: Extract<VoiceRelayEvent, { type: "ended" }>) {
  if (event.reason === "idle") return new AssistantCallError("idle-timeout");
  if (event.reason === "revoked") return new AssistantCallError("connection-changed");
  return new AssistantCallError("stopped", event.message ? new Error(event.message) : undefined);
}

/**
 * A phone call whose voice (Grok Voice or OpenAI Realtime) runs on the computer: the phone streams its
 * microphone in 100 ms frames and plays the replies. With echo cancellation on the device it is full
 * duplex: the microphone keeps streaming during a reply, each frame says how much of the reply was heard
 * (`playedMs`), and the computer interrupts the reply when the user speaks (`interrupted`). Without it the
 * call is half duplex: nothing is sent while a reply plays, and only a tap interrupts. A tap works in both.
 * It offers the controls of the on-computer call loop that apply to it.
 */
export class AssistantRealtimeCall {
  private active = false;
  private muted = false;
  private speakerMuted = false;
  private lease?: string;
  private cursor = 0;
  private seq = 0;
  private inFlight = 0;
  private phase: AssistantCallPhase = "idle";
  private capture?: { stop(): void };
  /** Each capture start gets a token; a stop or a newer start makes an older one stale. */
  private captureToken = 0;
  private capturing = false;
  /** Each response's audio starts `at` this many appended milliseconds into the player. */
  private playing?: { player: RealtimePlayer; responses: { id: string; at: number }[]; startedAt: number; appendedMs: number; finishing: boolean };
  /** Full duplex: granted by the native session and taken by a v2 relay; undefined until the call asked. */
  private duplex?: boolean;
  private readonly discarded = new Set<string>();
  private selected?: Readonly<AssistantVoiceTarget>;
  constructor(private readonly dependencies: AssistantRealtimeCallDependencies) {}
  get target() { return this.selected; }
  /** Whether speaking interrupts a reply in this call; undefined before the call asked the device. */
  get spokenInterrupt() { return this.duplex; }
  /** Typed messages go to the conversation itself during a realtime call. */
  get queued() { return 0; }
  private now() { return (this.dependencies.now ?? Date.now)(); }
  private live() {
    if (!this.active) return false;
    if (!this.dependencies.current()) { this.stop(); return false; }
    return true;
  }
  start(target: AssistantVoiceTarget): boolean {
    if (this.active || !this.dependencies.current()) return false;
    this.selected = Object.freeze({ ...target });
    this.active = true;
    void this.run();
    return true;
  }
  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.stopCapture();
    this.playing?.player.stop(); this.playing = undefined;
    const lease = this.lease;
    if (lease) void this.dependencies.port.request("voice.realtime.end", { lease }, { retry: false, timeoutMs: 5_000 }).catch(() => {});
    this.setPhase("idle");
  }
  setMuted(value: boolean): void {
    if (!this.live() || this.muted === value) return;
    this.muted = value;
    if (value) { this.stopCapture(); if (!this.playing) this.setPhase("muted"); }
    else if (!this.playing) this.listen();
    else if (this.duplex) this.openCapture();
  }
  setSpeakerMuted(value: boolean): void {
    this.speakerMuted = value;
    if (value) this.interrupt();
  }
  /** Tap to interrupt: stop the reply here and cut the computer's copy at what was heard. */
  interrupt(): boolean {
    if (!this.playing || !this.live() || !this.lease) return false;
    const { playedMs } = this.flush();
    void this.dependencies.port.request("voice.realtime.interrupt", { lease: this.lease, playedMs }, { retry: false, timeoutMs: 10_000 })
      .catch(error => this.fail(error));
    this.listen();
    return true;
  }
  /** What of the reply the user has heard: the current response and how far into it. */
  private heard() {
    const playing = this.playing;
    if (!playing) return undefined;
    const played = playing.player.playedMs?.() ?? Math.min(playing.appendedMs, this.now() - playing.startedAt);
    const total = Math.max(0, Math.min(playing.appendedMs, played));
    const response = playing.responses.findLast(response => response.at <= total) ?? playing.responses[0];
    return { responseId: response?.id, playedMs: Math.max(0, Math.floor(total - (response?.at ?? 0))) };
  }
  /** Silence the reply here at once and drop the rest of its audio; returns what was heard. */
  private flush() {
    const playing = this.playing!;
    const heard = this.heard()!;
    this.playing = undefined;
    playing.player.stop();
    for (const response of playing.responses) this.discarded.add(response.id);
    return heard;
  }
  private setPhase(phase: AssistantCallPhase) {
    if (this.phase === phase) return;
    this.phase = phase;
    this.dependencies.state(phase);
  }
  private fail(error: unknown) {
    if (!this.active) return;
    this.stop();
    this.dependencies.error(error);
  }
  private async run() {
    const { port, audio, relayV2 } = this.dependencies;
    try {
      // Ask once, before the relay starts and the microphone first opens: the computer must know at start
      // whether speech may interrupt a reply, and the native path can change only while the call is quiet.
      // An older relay cannot take spoken interruption, so its call never asks the device.
      const duplex = relayV2 && audio.duplex ? await audio.duplex().catch(() => false) === true : false;
      if (!this.live()) return;
      this.duplex = duplex;
      const started = await port.request<{ lease?: unknown; inRate?: unknown; outRate?: unknown }>("voice.realtime.start", {
        threadId: this.selected!.threadId, provider: this.dependencies.provider, language: this.dependencies.language,
        ...(this.dependencies.projectId ? { projectId: this.dependencies.projectId } : {}),
        ...(relayV2 ? { duplex } : {}),
      }, { retry: false, timeoutMs: START_TIMEOUT_MS });
      if (typeof started?.lease !== "string" || started.inRate !== VOICE_RELAY_IN_RATE || started.outRate !== VOICE_RELAY_OUT_RATE)
        throw new Error("Invalid voice connection.");
      this.lease = started.lease;
      if (!this.live()) { void port.request("voice.realtime.end", { lease: started.lease }, { retry: false, timeoutMs: 5_000 }).catch(() => {}); return; }
      // Only a v2 relay asks the device, so only it reports the answer; an older relay reports nothing.
      if (relayV2) this.dependencies.spokenInterrupt?.(duplex);
      this.listen();
      while (this.live()) {
        const next = await port.request<VoiceRelayNextResult>("voice.realtime.next", { lease: this.lease, cursor: this.cursor }, { retry: false, timeoutMs: NEXT_TIMEOUT_MS });
        if (!this.live()) return;
        this.cursor = Math.max(this.cursor, next.cursor);
        const items: ({ at: number; chunk: VoiceRelayNextResult["chunks"][number] } | { at: number; event: VoiceRelayEvent })[] =
          [...next.chunks.map(chunk => ({ at: chunk.at, chunk })), ...next.events.map(event => ({ at: event.at, event }))];
        items.sort((a, b) => a.at - b.at);
        for (const item of items) {
          if (!this.live()) return;
          if ("chunk" in item) this.play(item.chunk.audio, item.chunk.responseId);
          else this.apply(item.event);
        }
      }
    } catch (error) {
      this.fail(error);
    }
  }
  private apply(event: VoiceRelayEvent) {
    switch (event.type) {
      case "state":
        if (event.state === "thinking" && !this.playing) this.setPhase("sending");
        else if (event.state === "listening") this.finishReply();
        break;
      case "user_transcript": this.dependencies.transcript?.("user", event.text); break;
      case "assistant_transcript":
        if (!event.responseId || !this.discarded.has(event.responseId)) this.dependencies.transcript?.("assistant", event.text);
        break;
      // The computer heard the user speak over the reply and cut it at the last reported `playedMs`.
      case "interrupted":
        if (this.playing) { this.flush(); this.listen(); }
        break;
      case "ended":
        if (event.reason === "ended") this.stop();
        else this.fail(endFailure(event));
        break;
    }
  }
  private play(audio: string, responseId: string) {
    if (this.discarded.has(responseId) || this.speakerMuted) return;
    if (!this.playing || this.playing.finishing) {
      // Half duplex: the microphone closes while the reply plays (the native session does so too).
      if (!this.duplex) this.stopCapture();
      this.playing = { player: this.dependencies.audio.player(), responses: [], startedAt: this.now(), appendedMs: 0, finishing: false };
      this.setPhase("speaking");
    }
    if (this.playing.responses.at(-1)?.id !== responseId) this.playing.responses.push({ id: responseId, at: this.playing.appendedMs });
    this.playing.appendedMs += (audio.length * 3 / 4 / 2 / VOICE_RELAY_OUT_RATE) * 1000;
    this.playing.player.append(audio);
  }
  /** The computer is listening again: let the reply play out, then reopen the microphone. */
  private finishReply() {
    const playing = this.playing;
    if (!playing) { this.listen(); return; }
    playing.finishing = true;
    playing.player.finish().then(() => {
      if (this.playing !== playing) return;
      this.playing = undefined;
      this.listen();
    }, error => this.fail(error));
  }
  private listen() {
    if (!this.live()) return;
    if (this.muted) { this.setPhase("muted"); return; }
    this.setPhase("listening");
    this.openCapture();
  }
  private openCapture() {
    if (this.capturing || this.muted || !this.live()) return;
    this.capturing = true;
    const token = ++this.captureToken;
    const stale = () => token !== this.captureToken;
    this.dependencies.audio.capture(pcm => { if (!stale()) this.send(pcm); }, (reason, error) => {
      if (stale()) return;
      this.capture = undefined; this.capturing = false;
      if (!this.active) return;
      if (error || reason === "capture-error") { this.fail(new AssistantCallError("microphone-failed", error ? new Error(error) : undefined)); return; }
      // The 30-second capture limit: keep listening with a fresh capture (in duplex also during a reply).
      if (reason === "limit" && this.duplex) this.openCapture();
      else if (reason === "limit" && !this.playing && this.phase === "listening") this.listen();
    }).then(capture => {
      if (stale() || !this.active) { capture.stop(); return; }
      this.capture = capture;
    }, error => { if (!stale()) { this.capturing = false; this.fail(error); } });
  }
  private stopCapture() {
    const capture = this.capture;
    this.captureToken++;
    this.capture = undefined; this.capturing = false;
    capture?.stop();
  }
  private send(pcm: Int16Array) {
    if (!this.lease || this.muted || !this.live()) return;
    // Half duplex sends only while listening; full duplex streams throughout, so the computer hears speech over a reply.
    if (!this.duplex && (this.playing || this.phase !== "listening")) return;
    let squares = 0;
    for (const sample of pcm) squares += (sample / 32768) ** 2;
    this.dependencies.level?.(pcm.length ? Math.min(1, Math.sqrt(squares / pcm.length) * 4) : 0);
    if (this.inFlight >= MAX_UPLINK_IN_FLIGHT) return;
    this.inFlight++;
    // During a reply each frame carries how much of the current response was heard, for the computer's truncation.
    const heard = this.duplex ? this.heard() : undefined;
    void this.dependencies.port.request("voice.realtime.audio", {
      lease: this.lease, seq: this.seq++, audio: pcmBase64(pcm), ...(heard ? { playedMs: heard.playedMs } : {}),
    }, { retry: false, timeoutMs: 10_000 })
      .catch(error => this.fail(error))
      .finally(() => { this.inFlight--; });
  }
}
