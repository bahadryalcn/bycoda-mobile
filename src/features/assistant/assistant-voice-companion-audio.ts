import { File, Paths } from "expo-file-system";
import type { NativeVoiceCompanion } from "../../../modules/bycoda-voice-companion";
import { decodePcmBase64 } from "../../../../src/features/voice/model/voiceVad";
import type { VoiceCapture } from "./assistant-voice";
let captureSequence = 0;
let playbackSequence = 0;

/** The native session (Android service, iOS call engine) outlives one utterance. Its ID fences every native action. */
export function companionVoiceCapture(native: NativeVoiceCompanion, onBuffer: (data: Int16Array, rate: number) => void,
  onEnded?: (reason: string, error?: string) => void): VoiceCapture {
  const session = native.getState();
  if (!session.active || !session.sessionId) throw new Error("Start a voice session while Bycoda is visible before recording.");
  const id = session.sessionId;
  const captureId = `${Date.now()}-${++captureSequence}`;
  let stopped = false;
  let starting = false;
  const listener = native.addListener("onVoiceEvent", event => {
    if (stopped || event.sessionId !== id) return;
    if (event.type === "pcm" && event.captureId === captureId && event.audio && event.sampleRate === 16000) onBuffer(decodePcmBase64(event.audio), event.sampleRate);
    if (event.type === "ended" && (!event.captureId || event.captureId === captureId)) onEnded?.(event.reason ?? "stopped", event.error);
  });
  return {
    async start() {
      if (stopped) return;
      starting = true;
      try { await native.startCapture(id, captureId); }
      catch (error) { stopped = true; listener.remove(); throw error; }
      if (stopped) native.stopCapture(id, captureId);
    },
    stop() { if (stopped) return; stopped = true; listener.remove(); if (starting) native.stopCapture(id, captureId); },
  };
}

/** Native playback is also stopped by the notification actions (Android) while JS sleeps. */
export function companionVoicePlayback(native: NativeVoiceCompanion) {
  let stop = () => {};
  return {
    stop: () => stop(),
    async play(wav: Uint8Array, current: () => boolean) {
      if (!current()) throw new Error("The voice session is unavailable.");
      const session = native.getState(), owned = !session.active;
      const id = owned ? await native.beginPlaybackSession() : session.sessionId;
      const playbackId = `${Date.now()}-${++playbackSequence}`;
      let file: File | undefined;
      let listener: { remove(): void } | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        file = new File(Paths.cache, `bycoda-voice-${playbackId}.wav`);
        // write() is asynchronous in expo-file-system 58; native playback must open a complete file.
        file.writeSync(wav);
        const uri = file.uri;
        await new Promise<void>((resolve, reject) => {
          const finish = (error?: string) => { if (error) reject(new Error(error)); else resolve(); };
          listener = native.addListener("onVoiceEvent", event => {
            if (event.sessionId !== id) return;
            if (event.type === "playback" && event.playbackId === playbackId) finish(event.error);
            // A capture-scoped end (limit, mute, focus loss) belongs to the microphone, not to this playback.
            else if (event.type === "ended" && !event.captureId && event.reason !== "limit" && event.reason !== "muted") finish(event.error ?? "Voice session stopped.");
          });
          stop = () => { native.stopPlayback(id, playbackId); resolve(); };
          timer = setTimeout(() => { native.stopPlayback(id, playbackId); finish("Speech playback timed out."); }, 120000);
          if (!current()) { resolve(); return; }
          native.playWav(id, playbackId, uri).catch(reject);
        });
      } finally {
        clearTimeout(timer); listener?.remove(); native.stopPlayback(id, playbackId); stop = () => {};
        if (owned) native.endSession(id);
        if (file?.exists) file.delete();
      }
    },
  };
}
