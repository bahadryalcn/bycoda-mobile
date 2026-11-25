import { AssistantUtteranceVad, type AssistantTurnOptions } from "./assistant-call-loop";
import { pcmBase64, resamplePcm } from "../../../../src/features/voice/model/voiceVad";
import { graphemes } from "../../../../src/shared/lib/text/truncate";
import { assistantMicrophoneLevel, type AssistantVoiceStage } from "./assistant-voice-presentation";
import type { TranscriptionEngine } from "../voice-settings/voice-preferences";
import type { CloudDictationProvider } from "../../../../src/features/voice/model/dictationModels";

/** shortcut: the first part ends at a word boundary within 160 graphemes so audio starts sooner; upgrade if synthesis cost changes. */
const FIRST_SPEECH_PART = 160;
const MAX_SPEECH_PART = 700;

export function speechParts(text: string, shortFirstPart = true): string[] {
  const units = [...graphemes(text)];
  for (const unit of units) if (unit.length > MAX_SPEECH_PART) throw new Error("Speech text contains an oversized character sequence.");
  const parts: string[] = [];
  let start = 0;
  if (shortFirstPart && units.length > FIRST_SPEECH_PART) {
    const end = units.lastIndexOf(" ", FIRST_SPEECH_PART - 1) + 1;
    const head = units.slice(0, end).join("");
    if (end > 0 && head.length <= MAX_SPEECH_PART) { parts.push(head); start = end; }
  }
  let part = "";
  for (const grapheme of units.slice(start)) {
    if (part.length + grapheme.length > MAX_SPEECH_PART) { parts.push(part); part = ""; }
    part += grapheme;
  }
  if (part) parts.push(part);
  return parts;
}

export type SpeechChunk = { audio: string; sampleRate: number };
type SpeechChunks = SpeechChunk[];

/** Thrown when the phone denied microphone access; the UI offers to open system Settings. */
export class MicrophonePermissionError extends Error {
  constructor() { super("Microphone permission is required. Enable it in phone settings."); this.name = "MicrophonePermissionError"; }
}

export type AssistantVoiceTarget = { machineId: string; environmentId: string; threadId: string };
export type AssistantVoiceState = "idle" | "preparing" | "recording" | "transcribing" | "speaking";
export type VoicePort = {
  current(): boolean;
  request<T>(method: string, params: Record<string, unknown>, options: { retry: false; timeoutMs: number }): Promise<T>;
};
/** Marks a dictation that is transcribed by the cloud: there is no local lease to release. */
const CLOUD_LEASE = "cloud";
/**
 * One utterance must fit one 1 MiB socket frame as base64 16 kHz PCM (the Host accepts at most
 * 1,000,000 characters): 22 seconds. The call loop listens again right after it is sent.
 */
export const MAX_UTTERANCE_SAMPLES = 352_000;
const MAX_UTTERANCE_MS = 22_000;
export type VoiceCapture = { start(): Promise<void>; stop(): void };
export type AssistantVoiceDependencies = {
  capture(onBuffer: (data: Int16Array, sampleRate: number) => void, onEnded?: (reason: string, error?: string) => void): Promise<VoiceCapture>;
  play(chunks: { audio: string; sampleRate: number }[], current: () => boolean): Promise<void>;
  playStream?(chunks: AsyncIterable<SpeechChunk>, current: () => boolean): Promise<void>;
  stopPlayback(): void;
  state(state: AssistantVoiceState, target?: AssistantVoiceTarget): void;
  transcript(target: AssistantVoiceTarget, text: string): void | Promise<void>;
  error(error: unknown): void;
  level?(value: number): void;
  /** Transcription engine chosen in Settings → Voice; absent means this computer. */
  engine?(): TranscriptionEngine;
  cloudModel?(): string | undefined;
  /** The assistant's voice chosen in Settings → Voice; absent means the Host default. */
  speech?(): Record<string, unknown>;
  /** Reports the chain step about to run, before its first await, so a failure is attributed to it. */
  stage?(stage: AssistantVoiceStage): void;
};

/** Foreground microphone lifetime is independent of the expanded conversation route. */
export class AssistantVoice {
  private epoch = 0;
  private capture?: VoiceCapture;
  private lease?: { port: VoicePort; id: string; cloud?: { provider: CloudDictationProvider; model?: string } };
  private timer?: ReturnType<typeof setTimeout>;
  private keepAlive?: ReturnType<typeof setInterval>;
  private frames: Int16Array[] = [];
  private samples = 0;
  private target?: AssistantVoiceTarget;
  private port?: VoicePort;
  private phase: AssistantVoiceState = "idle";
  private utterance?: AssistantUtteranceVad;
  constructor(private readonly dependencies: AssistantVoiceDependencies) {}
  private update(phase: AssistantVoiceState) { this.phase = phase; if (phase !== "recording") this.dependencies.level?.(0); this.dependencies.state(phase, this.target); }
  private current(epoch: number) { return epoch === this.epoch && this.port?.current() === true; }
  private async release() {
    clearInterval(this.keepAlive); this.keepAlive = undefined;
    const lease = this.lease;
    this.lease = undefined;
    if (lease && lease.id !== CLOUD_LEASE) await lease.port.request("voice.local.release", { lease: lease.id }, { retry: false, timeoutMs: 5000 }).catch(() => {});
  }
  cancel() {
    this.epoch++;
    clearTimeout(this.timer);
    this.capture?.stop(); this.capture = undefined;
    this.dependencies.stopPlayback();
    this.frames = []; this.samples = 0; this.utterance = undefined;
    void this.release();
    this.update("idle");
  }
  /** The chosen voice; every natural start sends the same one, so a call's leases share one Host runtime. */
  private speechConfig(): Record<string, unknown> {
    return { ...(this.dependencies.speech?.() ?? {}), natural: true };
  }
  /** `natural` matches the speech lease a call holds, so the Host shares its loaded models instead of reloading. */
  async record(port: VoicePort, target: AssistantVoiceTarget, options?: { endOnSilence?: boolean; natural?: boolean; turn?: AssistantTurnOptions }) {
    if (this.phase !== "idle" || !port.current()) return;
    this.port = port; this.target = { ...target };
    this.utterance = options?.endOnSilence ? new AssistantUtteranceVad(options.turn) : undefined;
    const epoch = ++this.epoch;
    this.update("preparing");
    try {
      this.dependencies.stage?.("microphone");
      const capture = await this.dependencies.capture((data, rate) => {
        if (!this.current(epoch) || this.phase !== "recording") { if (!port.current()) this.cancel(); return; }
        const pcm = resamplePcm(data, rate);
        this.dependencies.level?.(assistantMicrophoneLevel(pcm));
        const remaining = 480_000 - this.samples;
        if (remaining <= 0) return;
        const frame = pcm.slice(0, remaining);
        this.frames.push(frame); this.samples += frame.length;
        const ended = this.utterance?.push(frame) ?? false;
        if (ended || this.samples >= MAX_UTTERANCE_SAMPLES) void this.finish();
      }, (reason, error) => {
        if (epoch !== this.epoch || (this.phase !== "preparing" && this.phase !== "recording")) return;
        if (reason === "limit" && this.phase === "recording") { void this.finish(); return; }
        this.cancel();
        this.dependencies.stage?.("microphone");
        this.dependencies.error(new Error(error || "Microphone recording stopped unexpectedly."));
      });
      if (!this.current(epoch)) { capture.stop(); if (epoch === this.epoch) this.cancel(); return; }
      this.capture = capture;
      this.dependencies.stage?.("transcription");
      const engine = this.dependencies.engine?.() ?? "local";
      const model = this.dependencies.cloudModel?.();
      const cloud = engine === "local" ? undefined : {
        provider: engine === "cloud" ? "openrouter" as const : engine,
        ...(model ? { model } : {}),
      };
      const result = cloud ? { lease: CLOUD_LEASE } : await port.request<{ lease: string }>("voice.local.start", { config: options?.natural ? this.speechConfig() : { natural: false }, recognitionOnly: true }, { retry: false, timeoutMs: 60000 });
      if (typeof result?.lease !== "string" || !result.lease) throw new Error("Invalid voice connection.");
      if (!this.current(epoch)) {
        capture.stop();
        if (epoch === this.epoch) this.cancel();
        if (result.lease !== CLOUD_LEASE) await port.request("voice.local.release", { lease: result.lease }, { retry: false, timeoutMs: 5000 }).catch(() => {});
        return;
      }
      this.lease = { port, id: result.lease, cloud };
      this.dependencies.stage?.("microphone");
      await capture.start();
      if (!this.current(epoch)) { capture.stop(); if (epoch === this.epoch) this.cancel(); return; }
      this.update("recording");
      this.timer = setTimeout(() => { void this.finish(); }, MAX_UTTERANCE_MS);
    } catch (error) {
      if (epoch === this.epoch) { this.cancel(); this.dependencies.error(error); }
    }
  }
  async finish() {
    if (this.phase !== "recording") return;
    const epoch = this.epoch, target = this.target!, lease = this.lease!;
    clearTimeout(this.timer);
    if (!this.current(epoch)) { this.cancel(); return; }
    // Native stop can synchronously report onEnded; this is an intentional transcription boundary.
    const hasSpeech = !this.utterance || this.utterance.hasSpeech;
    if (hasSpeech) {
      this.dependencies.stage?.("transcription");
      this.update("transcribing");
    } else this.phase = "transcribing";
    this.capture?.stop(); this.capture = undefined;
    try {
      if (!hasSpeech) {
        this.frames = []; this.samples = 0;
        await this.dependencies.transcript(target, "");
        return;
      }
      if (this.samples < 1600) throw new Error("Record at least a short phrase.");
      const pcm = new Int16Array(this.samples);
      let offset = 0;
      for (const frame of this.frames) { pcm.set(frame, offset); offset += frame.length; }
      this.frames = []; this.samples = 0;
      const audio = pcmBase64(pcm);
      const result = lease.cloud
        ? await lease.port.request<{ text: string }>("voice.cloud.transcribe", { ...lease.cloud, audio }, { retry: false, timeoutMs: 40000 })
        : await lease.port.request<{ text: string }>("voice.local.transcribe", { lease: lease.id, audio }, { retry: false, timeoutMs: 40000 });
      if (!this.current(epoch)) return;
      if (typeof result?.text !== "string" || result.text.length > 16000) throw new Error("Speech could not be recognized. Try again.");
      // Noise that passed the phone's speech detector transcribes to nothing: like silence, keep listening.
      await this.dependencies.transcript(target, result.text.trim());
    } catch (error) { if (this.current(epoch)) this.dependencies.error(error); }
    finally { if (epoch === this.epoch) { await this.release(); if (epoch === this.epoch) this.update("idle"); } }
  }
  async speak(port: VoicePort, target: AssistantVoiceTarget, text: string) {
    if (this.phase !== "idle" || !port.current()) return;
    if (!text.trim() || text.length > 16000) { this.dependencies.error(new Error("The reply is too long to read aloud.")); return; }
    this.port = port; this.target = { ...target };
    const epoch = ++this.epoch;
    this.update("preparing");
    try {
      this.dependencies.stage?.("synthesis");
      const result = await port.request<{ lease: string }>("voice.local.start", { config: this.speechConfig() }, { retry: false, timeoutMs: 60000 });
      if (typeof result?.lease !== "string" || !result.lease) throw new Error("Invalid voice connection.");
      if (!this.current(epoch)) { if (epoch === this.epoch) this.cancel(); await port.request("voice.local.release", { lease: result.lease }, { retry: false, timeoutMs: 5000 }).catch(() => {}); return; }
      this.lease = { port, id: result.lease };
      this.update("speaking");
      this.keepAlive = setInterval(() => {
        if (!this.current(epoch)) { if (epoch === this.epoch) this.cancel(); return; }
        void port.request("voice.local.keepAlive", { lease: result.lease }, { retry: false, timeoutMs: 5000 }).catch(error => {
          if (this.current(epoch)) { this.cancel(); this.dependencies.error(error); }
        });
      }, 30000);
      if (this.dependencies.playStream) {
        await this.dependencies.playStream(this.streamSpeech(port, result.lease, epoch, text), () => this.current(epoch));
        return;
      }
      // Parts play in order. The next part synthesizes while the current one plays; parts are never synthesized concurrently.
      const parts = speechParts(text);
      let pending: Promise<SpeechChunks | undefined> | undefined;
      for (let index = 0; index < parts.length; index++) {
        if (!this.current(epoch)) return;
        this.dependencies.stage?.("synthesis");
        const ready = pending ?? this.synthesize(port, result.lease, epoch, parts[index]!);
        const chunks = await ready;
        if (!chunks || !this.current(epoch)) return;
        pending = index + 1 < parts.length ? this.synthesize(port, result.lease, epoch, parts[index + 1]!) : undefined;
        pending?.catch(() => {}); // a failure is reported when this part is awaited above
        this.dependencies.stage?.("playback");
        await this.dependencies.play(chunks, () => this.current(epoch));
      }
    } catch (error) { if (this.current(epoch)) this.dependencies.error(error); }
    finally { if (epoch === this.epoch) { await this.release(); if (epoch === this.epoch) this.update("idle"); } }
  }

  private async *streamSpeech(port: VoicePort, lease: string, epoch: number, text: string) {
    let started = false;
    for (const part of speechParts(text, false)) {
      if (!this.current(epoch)) return;
      try {
        for await (const chunk of this.speechChunks(port, lease, epoch, part)) {
          if (!started) { started = true; this.dependencies.stage?.("playback"); }
          yield chunk;
        }
      } catch (error) {
        if (this.current(epoch)) this.dependencies.stage?.("synthesis");
        throw error;
      }
    }
  }

  /** Synthesizes one part; resolves undefined once the request is no longer current. */
  private async synthesize(port: VoicePort, lease: string, epoch: number, part: string): Promise<SpeechChunks | undefined> {
    const chunks: SpeechChunks = [];
    for await (const chunk of this.speechChunks(port, lease, epoch, part)) chunks.push(chunk);
    if (this.current(epoch)) return chunks;
  }

  private async *speechChunks(port: VoicePort, lease: string, epoch: number, part: string): AsyncGenerator<SpeechChunk> {
    const speech = await port.request<{ id: string }>("voice.local.speak", { lease, text: part }, { retry: false, timeoutMs: 30000 });
    if (typeof speech?.id !== "string" || !speech.id) throw new Error("Invalid speech response.");
    let complete = false, bytes = 0;
    for (let count = 0; count < 420 && this.current(epoch); count++) {
      const chunk = await port.request<{ audio?: string; sampleRate?: number; done?: boolean; error?: string }>("voice.local.speechNext", { lease, id: speech.id }, { retry: false, timeoutMs: 15000 });
      if (!this.current(epoch)) break;
      if (chunk.error) throw new Error(chunk.error);
      if (chunk.done) { complete = true; break; }
      if (chunk.audio) {
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(chunk.audio) || !Number.isInteger(chunk.sampleRate) || chunk.sampleRate! < 8000 || chunk.sampleRate! > 96000) throw new Error("Invalid speech audio.");
        bytes += chunk.audio.length;
        if (bytes > 8_000_000) throw new Error("Speech response is too large.");
        yield { audio: chunk.audio, sampleRate: chunk.sampleRate! };
      }
    }
    if (!this.current(epoch)) return;
    if (!complete) throw new Error("The computer took too long to generate speech.");
    if (!bytes) throw new Error("The computer returned no speech audio.");
  }
}
