import { AssistantCallError } from "./assistant-call-error";
import type { AssistantVoiceTarget } from "./assistant-voice";
import { VoiceVad } from "../../../../src/features/voice/model/voiceVad";

export type AssistantCallPhase = "idle" | "listening" | "sending" | "speaking" | "muted";
export type AssistantCallDependencies = {
  capture(target: Readonly<AssistantVoiceTarget>, current: () => boolean): Promise<string>;
  /** Resolve only after durable admission and an authoritative reply; unknown delivery rejects. */
  send(text: string, target: Readonly<AssistantVoiceTarget>, current: () => boolean): Promise<string>;
  speak(text: string, target: Readonly<AssistantVoiceTarget>, current: () => boolean): Promise<void>;
  cancelAudio(): void;
  current(target: Readonly<AssistantVoiceTarget>): boolean;
  state(phase: AssistantCallPhase, target?: Readonly<AssistantVoiceTarget>): void;
  error(error: unknown): void;
};

/** One conversation across expanded, movable and authorized background views. Muting never retries a sent utterance. */
export class AssistantCallLoop {
  private active = false;
  private muted = false;
  private speakerMuted = false;
  private speaking = false;
  private epoch = 0;
  private pending?: Promise<void>;
  private selected?: Readonly<AssistantVoiceTarget>;
  private wake?: () => void;
  private lastUtteranceAt = 0;
  constructor(private readonly dependencies: AssistantCallDependencies) {}
  get target() { return this.selected; }
  current(): boolean {
    if (!this.active || !this.selected) return false;
    if (!this.dependencies.current(this.selected)) { this.stop(); return false; }
    return true;
  }
  start(target: AssistantVoiceTarget): boolean {
    if (this.active || this.pending || !this.dependencies.current(target)) return false;
    this.selected = Object.freeze({ ...target });
    this.active = true; this.muted = false; this.speakerMuted = false; this.epoch++;
    this.lastUtteranceAt = Date.now();
    this.launch();
    return true;
  }
  stop(): void {
    if (!this.active) return;
    this.active = false; this.epoch++;
    this.wake?.(); this.wake = undefined;
    this.dependencies.cancelAudio();
    this.dependencies.state("idle", this.selected);
  }
  setMuted(value: boolean): void {
    if (!this.current() || this.muted === value) return;
    this.muted = value; this.epoch++;
    this.wake?.(); this.wake = undefined;
    if (value) { this.dependencies.cancelAudio(); this.dependencies.state("muted", this.selected); }
    else {
      // Muted time is not listening time: the idle window restarts with the owner's explicit unmute, as the native timer does.
      this.lastUtteranceAt = Date.now();
      if (!this.pending) this.launch();
    }
  }
  /** Stops the reply being spoken and returns to listening; the sent message and its reply stay in the conversation. */
  interrupt(): boolean {
    if (!this.speaking || this.muted || !this.current()) return false;
    this.epoch++; this.speaking = false;
    this.wake?.(); this.wake = undefined;
    this.dependencies.cancelAudio();
    return true;
  }
  /** Replies stay written in the conversation; muting the speaker only skips playback. */
  setSpeakerMuted(value: boolean): void {
    this.speakerMuted = value;
    if (value) this.interrupt();
  }
  private valid(epoch: number) { return this.epoch === epoch && !this.muted && this.current(); }
  private launch() {
    if (this.pending || !this.current() || this.muted) return;
    const epoch = this.epoch;
    this.pending = this.run(epoch).finally(() => {
      this.pending = undefined;
      // A canceled capture/send must settle before an unmute can own a new listener.
      if (this.current() && !this.muted) this.launch();
    });
  }
  private pause() {
    return new Promise<void>(resolve => {
      const timer = setTimeout(() => { this.wake = undefined; resolve(); }, 500);
      this.wake = () => { clearTimeout(timer); resolve(); };
    });
  }
  private async run(epoch: number) {
    const target = this.selected!;
    const current = () => this.valid(epoch);
    let sending = false;
    try {
      while (current()) {
        this.dependencies.state("listening", target);
        const text = (await this.dependencies.capture(target, current)).trim();
        if (!current()) return;
        if (!text) {
          // Match the native idle safety: empty captures do not count as owner speech or reset its wall-clock deadline.
          if (Date.now() - this.lastUtteranceAt >= 180000) throw new AssistantCallError("no-speech");
          await this.pause();
          continue;
        }
        this.lastUtteranceAt = Date.now();
        this.dependencies.state("sending", target);
        sending = true;
        const reply = await this.dependencies.send(text, target, current);
        sending = false;
        if (!current()) return;
        if (reply.trim() && !this.speakerMuted) {
          this.dependencies.state("speaking", target);
          this.speaking = true;
          try { await this.dependencies.speak(reply, target, current); } finally { this.speaking = false; }
        }
      }
    } catch (error) {
      if ((sending && this.active && this.selected === target) || current()) { this.stop(); this.dependencies.error(error); }
    }
  }
}

/** Use the desktop speech detector with steady 64 ms frames, regardless of native event size. */
export class AssistantUtteranceVad {
  private frame = new Int16Array(1024);
  private filled = 0;
  private samples = 0;
  private ended = false;
  private speech = false;
  private vad = new VoiceVad(16000, () => { this.speech = true; },
    () => { this.ended = true; }, () => { this.speech = false; }, { endSilence: 0.9 });
  get hasSpeech() { return this.speech; }
  push(pcm: Int16Array): boolean {
    for (let offset = 0; offset < pcm.length && !this.ended;) {
      const length = Math.min(pcm.length - offset, this.frame.length - this.filled);
      this.frame.set(pcm.subarray(offset, offset + length), this.filled);
      offset += length;
      this.filled += length;
      this.samples += length;
      if (this.filled === this.frame.length) {
        this.vad.push(this.frame);
        this.frame = new Int16Array(1024);
        this.filled = 0;
      }
      if (!this.speech && this.samples >= 128000) this.ended = true;
    }
    return this.ended;
  }
}
