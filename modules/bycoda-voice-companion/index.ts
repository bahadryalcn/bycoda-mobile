import { requireOptionalNativeModule } from "expo";

export type NativeVoiceState = { active: boolean; sessionId: string; phase: "idle" | "recording" | "speaking"; muted: boolean; pip: boolean };
export type NativeVoiceEvent = { sessionId: string; type: "state" | "pcm" | "ended" | "playback"; state?: NativeVoiceState; audio?: string; sampleRate?: number; reason?: string; captureId?: string; playbackId?: string; error?: string };
export type NativeVoiceCompanion = {
  /** Must be called while visible, unlocked and with microphone permission granted. */
  beginSession(): Promise<string>;
  /** Foreground-only standalone TTS, without microphone authority or permission. */
  beginPlaybackSession(): Promise<string>;
  getState(): NativeVoiceState;
  /** Current native audio inputs and their route types, read without starting capture. */
  listInputs?(): { name: string; type: string; uid: string }[];
  /** The next capture prefers this input (a uid from listInputs); null keeps the system default. */
  setPreferredInput?(uid: string | null): void;
  startCapture(sessionId: string, captureId: string): Promise<void>;
  stopCapture(sessionId: string, captureId: string): void;
  setMuted(sessionId: string, muted: boolean): void;
  /** Only an app-owned cached WAV is accepted. Completion arrives as a playback event. */
  playWav(sessionId: string, playbackId: string, uri: string): Promise<void>;
  startPcm?(sessionId: string, playbackId: string, sampleRate: number): Promise<void>;
  appendPcm?(sessionId: string, playbackId: string, audio: string): Promise<void>;
  finishPcm?(sessionId: string, playbackId: string): Promise<void>;
  stopPlayback(sessionId: string, playbackId: string): void;
  endSession(sessionId: string): void;
  enterPip(sessionId: string): Promise<boolean>;
  addListener(event: "onVoiceEvent", listener: (event: NativeVoiceEvent) => void): { remove(): void };
};
/** No browser/Expo Go substitute for foreground-service authority. */
export function nativeVoiceCompanion(): NativeVoiceCompanion | null {
  return requireOptionalNativeModule<NativeVoiceCompanion>("BycodaVoiceCompanion");
}
