import { File, Paths } from "expo-file-system";
import type { NativeVoiceCompanion } from "../../../modules/bycoda-voice-companion";
import { decodePcmBase64 } from "../../../../src/shared/model/voice-realtime/voiceVad";
import type { SpeechChunk, VoiceCapture } from "./assistant-voice";
let captureSequence = 0;
let playbackSequence = 0;

/** The native session (Android service, iOS call engine) outlives one utterance. Its ID fences every native action. */
export function companionVoiceCapture(native: NativeVoiceCompanion, onBuffer: (data: Int16Array, rate: number) => void,
  onEnded?: (reason: string, error?: string) => void, batchBytes?: number): VoiceCapture {
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
      // Older native builds take two arguments; only a realtime call asks for its smaller batch.
      try { await (batchBytes === undefined ? native.startCapture(id, captureId) : native.startCapture(id, captureId, batchBytes)); }
      catch (error) { stopped = true; listener.remove(); throw error; }
      if (stopped) native.stopCapture(id, captureId);
    },
    stop() { if (stopped) return; stopped = true; listener.remove(); if (starting) native.stopCapture(id, captureId); },
  };
}

/** Native playback is also stopped by the notification actions (Android) while JS sleeps. */
export function companionVoicePlayback(native: NativeVoiceCompanion) {
  let stop = () => {};
  const startPcm = native.startPcm?.bind(native);
  const appendPcm = native.appendPcm?.bind(native);
  const finishPcm = native.finishPcm?.bind(native);
  return {
    stop: () => stop(),
    playStream: startPcm && appendPcm && finishPcm ? async (
      chunks: AsyncIterable<SpeechChunk>, current: () => boolean,
    ) => {
      const playbackId = `${Date.now()}-${++playbackSequence}`;
      let id: string | undefined;
      let sampleRate: number | undefined;
      let listened: ReturnType<NativeVoiceCompanion["addListener"]> | undefined;
      let ownsSession = false;
      let stopped = false;
      let serviceError: string | undefined;
      const cancel = () => { stopped = true; if (id) native.stopPlayback(id, playbackId); };
      stop = cancel;
      try {
        for await (const chunk of chunks) {
          if (serviceError) throw new Error(serviceError);
          if (stopped || !current()) return;
          if (id === undefined) {
            const session = native.getState();
            ownsSession = !session.active;
            id = ownsSession ? await native.beginPlaybackSession() : session.sessionId;
            if (stopped || !current()) return;
            listened = native.addListener("onVoiceEvent", event => {
              if (event.sessionId !== id) return;
              if (event.type === "playback" && event.playbackId === playbackId) {
                serviceError = event.error;
                stopped = true;
              } else if (event.type === "ended" && !event.captureId && event.reason !== "limit" && event.reason !== "muted") {
                serviceError = event.error ?? "Voice session stopped.";
                stopped = true;
              }
            });
            sampleRate = chunk.sampleRate;
            await startPcm(id, playbackId, sampleRate);
          }
          if (serviceError) throw new Error(serviceError);
          if (stopped || !current()) return;
          if (chunk.sampleRate !== sampleRate) throw new Error("Invalid speech sample rate.");
          await appendPcm(id, playbackId, chunk.audio);
        }
        if (serviceError) throw new Error(serviceError);
        if (id && !stopped && current()) await finishPcm(id, playbackId);
        if (serviceError) throw new Error(serviceError);
      } finally {
        listened?.remove();
        if (id) {
          native.stopPlayback(id, playbackId);
          if (ownsSession) native.endSession(id);
        }
        if (stop === cancel) stop = () => {};
      }
    } : undefined,
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
