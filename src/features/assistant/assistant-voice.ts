import { AssistantUtteranceVad } from "./assistant-call-loop";
import { pcmBase64, resamplePcm } from "../../../../src/features/voice/model/voiceVad";
import { graphemes } from "../../../../src/shared/lib/text/truncate";
import { assistantMicrophoneLevel } from "./assistant-voice-presentation";

export function speechParts(text: string): string[] {
  const parts: string[] = [];
  let part = "";
  for (const grapheme of graphemes(text)) {
    if (grapheme.length > 700) throw new Error("Speech text contains an oversized character sequence.");
    if (part.length + grapheme.length > 700) { parts.push(part); part = ""; }
    part += grapheme;
  }
  if (part) parts.push(part);
  return parts;
}

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
  stopPlayback(): void;
  state(state: AssistantVoiceState, target?: AssistantVoiceTarget): void;
  transcript(target: AssistantVoiceTarget, text: string): void | Promise<void>;
  error(error: unknown): void;
  level?(value: number): void;
  /** Transcription engine chosen in Settings → Voice; absent means this computer. */
  engine?(): "local" | "cloud";
};

/** Foreground microphone lifetime is independent of the expanded conversation route. */
export class AssistantVoice {
  private epoch = 0;
  private capture?: VoiceCapture;
  private lease?: { port: VoicePort; id: string };
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
  async record(port: VoicePort, target: AssistantVoiceTarget, options?: { endOnSilence?: boolean }) {
    if (this.phase !== "idle" || !port.current()) return;
    this.port = port; this.target = { ...target };
    this.utterance = options?.endOnSilence ? new AssistantUtteranceVad() : undefined;
    const epoch = ++this.epoch;
    this.update("preparing");
    try {
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
        this.dependencies.error(new Error(error || "Microphone recording stopped unexpectedly."));
      });
      if (!this.current(epoch)) { capture.stop(); if (epoch === this.epoch) this.cancel(); return; }
      this.capture = capture;
      const result = this.dependencies.engine?.() === "cloud" ? { lease: CLOUD_LEASE } : await port.request<{ lease: string }>("voice.local.start", { config: { natural: false }, recognitionOnly: true }, { retry: false, timeoutMs: 60000 });
      if (typeof result?.lease !== "string" || !result.lease) throw new Error("Invalid voice connection.");
      if (!this.current(epoch)) {
        capture.stop();
        if (epoch === this.epoch) this.cancel();
        if (result.lease !== CLOUD_LEASE) await port.request("voice.local.release", { lease: result.lease }, { retry: false, timeoutMs: 5000 }).catch(() => {});
        return;
      }
      this.lease = { port, id: result.lease };
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
    this.update("transcribing");
    this.capture?.stop(); this.capture = undefined;
    try {
      if (this.utterance && !this.utterance.hasSpeech) {
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
      const result = lease.id === CLOUD_LEASE
        ? await lease.port.request<{ text: string }>("voice.cloud.transcribe", { provider: "openrouter", audio }, { retry: false, timeoutMs: 40000 })
        : await lease.port.request<{ text: string }>("voice.local.transcribe", { lease: lease.id, audio }, { retry: false, timeoutMs: 40000 });
      if (!this.current(epoch)) return;
      if (typeof result?.text !== "string" || !result.text.trim() || result.text.length > 16000) throw new Error("Speech could not be recognized. Try again.");
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
      const result = await port.request<{ lease: string }>("voice.local.start", { config: { natural: true } }, { retry: false, timeoutMs: 60000 });
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
      // The local synthesizer accepts 700 characters per utterance; retain every part of the reply.
      for (const part of speechParts(text)) {
        if (!this.current(epoch)) return;
        const speech = await port.request<{ id: string }>("voice.local.speak", { lease: result.lease, text: part }, { retry: false, timeoutMs: 30000 });
        if (typeof speech?.id !== "string" || !speech.id) throw new Error("Invalid speech response.");
        const chunks: { audio: string; sampleRate: number }[] = [];
        let complete = false, bytes = 0;
        for (let count = 0; count < 420 && this.current(epoch); count++) {
          const chunk = await port.request<{ audio?: string; sampleRate?: number; done?: boolean; error?: string }>("voice.local.speechNext", { lease: result.lease, id: speech.id }, { retry: false, timeoutMs: 15000 });
          if (!this.current(epoch)) break;
          if (chunk.error) throw new Error(chunk.error);
          if (chunk.done) { complete = true; break; }
          if (chunk.audio) {
            if (!/^[A-Za-z0-9+/]+={0,2}$/.test(chunk.audio) || !Number.isInteger(chunk.sampleRate) || chunk.sampleRate! < 8000 || chunk.sampleRate! > 96000) throw new Error("Invalid speech audio.");
            bytes += chunk.audio.length;
            if (bytes > 8_000_000) throw new Error("Speech response is too large.");
            chunks.push({ audio: chunk.audio, sampleRate: chunk.sampleRate! });
          }
        }
        if (!this.current(epoch)) return;
        if (!complete) throw new Error("Speech playback timed out.");
        await this.dependencies.play(chunks, () => this.current(epoch));
      }
    } catch (error) { if (this.current(epoch)) this.dependencies.error(error); }
    finally { if (epoch === this.epoch) { await this.release(); if (epoch === this.epoch) this.update("idle"); } }
  }
}
