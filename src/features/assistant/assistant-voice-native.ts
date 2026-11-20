import { AudioModule, createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { nativeVoiceCompanion } from "../../../modules/bycoda-voice-companion";
import { companionVoiceCapture, companionVoicePlayback } from "./assistant-voice-companion-audio";
import { decodePcmBase64 } from "../../../../src/features/voice/model/voiceVad";
import type { AssistantVoiceDependencies } from "./assistant-voice";
import { requireMicrophonePermission } from "../permissions/microphone-permission";
import { applyAndroidMicPriority, applyMicPriority, type MicRecorder } from "../voice-settings/mic-input";
import { speechConfig, voicePreferences } from "../voice-settings/voice-preferences";

/** Local PCM returned by the Host becomes a temporary, standards-compliant mono WAV. */
export function speechWav(chunks: { audio: string; sampleRate: number }[]) {
  const rate = chunks[0]?.sampleRate;
  if (!rate || chunks.some(chunk => chunk.sampleRate !== rate)) throw new Error("Invalid speech sample rate.");
  const parts = chunks.map(chunk => decodePcmBase64(chunk.audio));
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const bytes = new Uint8Array(44 + size), view = new DataView(bytes.buffer);
  const word = (at: number, text: string) => { for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i); };
  word(0, "RIFF"); view.setUint32(4, 36 + size, true); word(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); word(36, "data"); view.setUint32(40, size, true);
  let at = 44;
  for (const part of parts) for (const sample of part) { view.setInt16(at, sample, true); at += 2; }
  return bytes;
}

export function nativeVoiceDependencies(callbacks: Pick<AssistantVoiceDependencies, "state" | "transcript" | "error" | "level" | "stage">): AssistantVoiceDependencies {
  let stopPlayback = () => {};
  const companion = nativeVoiceCompanion();
  // Android always records and plays through the companion service. On iOS the companion owns only a
  // started call (its running audio engine keeps the call alive in the background); dictation and
  // read-aloud outside a call keep the foreground expo-audio path.
  const native = () => Platform.OS === "android" || !!companion?.getState().active;
  const playback = companion ? companionVoicePlayback(companion) : null;
  return {
    ...callbacks,
    engine: () => voicePreferences.getState().preferences.engine,
    speech: () => speechConfig(voicePreferences.getState().preferences),
    async capture(onBuffer: (data: Int16Array, rate: number) => void, onEnded?: (reason: string, error?: string) => void) {
      await requireMicrophonePermission();
      await voicePreferences.getState().hydrate();
      const { micOrder } = voicePreferences.getState().preferences;
      if (native()) {
        if (!companion) throw new Error("Update Bycoda to use the native voice companion.");
        const owned = !companion.getState().active;
        applyAndroidMicPriority(micOrder, companion);
        const id = owned ? await companion.beginSession() : companion.getState().sessionId;
        try {
          const capture = companionVoiceCapture(companion, onBuffer, onEnded);
          return { start: () => capture.start(), stop: () => { capture.stop(); if (owned) companion.endSession(id); } };
        } catch (error) { if (owned) companion.endSession(id); throw error; }
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: "doNotMix" });
      await applyMicPriority(micOrder, () => new AudioModule.AudioRecorder({}) as unknown as MicRecorder);
      const stream = new AudioModule.AudioStream({ sampleRate: 16000, channels: 1, encoding: "int16" });
      let released = false, stopping = false, starting = false;
      const listener = stream.addListener("audioStreamBuffer", buffer => {
        if (stopping || released || !Number.isFinite(buffer.sampleRate) || buffer.sampleRate < 8000 || buffer.sampleRate > 192000 || buffer.channels < 1 || buffer.channels > 8 || buffer.data.byteLength % 2) return;
        const samples = new Int16Array(buffer.data);
        if (buffer.channels === 1) onBuffer(samples, buffer.sampleRate);
        else {
          const mono = new Int16Array(Math.floor(samples.length / buffer.channels));
          for (let i = 0; i < mono.length; i++) {
            let sum = 0;
            for (let channel = 0; channel < buffer.channels; channel++) sum += samples[i * buffer.channels + channel]!;
            mono[i] = sum / buffer.channels;
          }
          onBuffer(mono, buffer.sampleRate);
        }
      });
      const cleanup = () => {
        if (released) return;
        listener.remove(); stream.stop();
        // Native start may settle after cancellation. Stop again then, before releasing the shared object.
        if (!starting) { stream.release(); released = true; }
      };
      return {
        async start() {
          if (stopping || released) return;
          starting = true;
          try { await stream.start(); }
          finally { starting = false; if (stopping) cleanup(); }
        },
        stop() { stopping = true; cleanup(); },
      };
    },
    async play(chunks, current) {
      if (!chunks.length || !current()) return;
      if (native()) {
        if (!playback) throw new Error("Update Bycoda to use the native voice companion.");
        await playback.play(speechWav(chunks), current); return;
      }
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: "doNotMix" });
      if (!current()) return;
      const file = new File(Paths.cache, `bycoda-voice-${Date.now()}.wav`);
      // write() is asynchronous in expo-file-system 58; the player must open a complete file.
      file.writeSync(speechWav(chunks));
      const player = createAudioPlayer(file.uri);
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Speech playback timed out.")), 120000);
          const listener = player.addListener("playbackStatusUpdate", status => {
            if (status.error) reject(new Error(status.error));
            else if (status.didJustFinish || !current()) resolve();
          });
          stopPlayback = () => { clearTimeout(timer); listener.remove(); player.pause(); resolve(); };
          player.play();
        });
      } finally {
        stopPlayback(); stopPlayback = () => {};
        player.release();
        if (file.exists) file.delete();
      }
    },
    stopPlayback: () => { playback?.stop(); stopPlayback(); },
  };
}
