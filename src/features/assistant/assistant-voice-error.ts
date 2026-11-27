import { HostWsError } from "@/remote/ws-connection";
import { RemoteHostError } from "@/remote/host-error";
import { AssistantCallError, assistantCallErrorMessage } from "./assistant-call-error";
import { voiceNativeMessage } from "./assistant-voice-native-error";
import type { AssistantVoiceStage } from "./assistant-voice-presentation";

type Copy = (turkish: string, english: string, values?: Record<string, string | number>) => string;

/**
 * Dictation, read-aloud and capture raise plain `Error`s whose English message is for logs and tests.
 * Each one the app itself throws is translated here by its exact text, so an owner never reads an
 * English sentence in another language. Unknown app errors get one localized line instead of raw text.
 */
const known: Record<string, (copy: Copy) => string> = {
  "Microphone access was not granted. Tap the microphone to try again.": copy =>
    copy("Mikrofon izni verilmedi. Yeniden denemek için mikrofona dokun.", "Microphone access was not granted. Tap the microphone to try again."),
  "Microphone permission is required. Enable it in phone settings.": copy =>
    copy("Mikrofon izni gerekiyor. Telefon ayarlarından aç.", "Microphone permission is required. Enable it in phone settings."),
  "Dictation stopped because the app lost focus. Return to bycoda and try again.": copy =>
    copy("Uygulama arka plana geçtiği için sesle yazma durdu. bycoda’ya dönüp yeniden dene.", "Dictation stopped because the app lost focus. Return to bycoda and try again."),
  "A recognized speech draft is awaiting recovery.": copy =>
    copy("Önceki kaydın metni bekliyor. Önce onu taslağa ekle.", "Text from your last recording is waiting. Add it to the draft first."),
  "End the voice call before starting dictation or read aloud.": copy =>
    copy("Sesle yazmadan veya sesli okumadan önce sesli görüşmeyi bitir.", "End the voice call before starting dictation or read aloud."),
  "The assistant computer connection is unavailable.": copy =>
    copy("Asistanın bilgisayar bağlantısı kullanılamıyor.", "The assistant computer connection is unavailable."),
  "Voice stopped because the computer connection changed. Check the connection and try again.": copy =>
    copy("Bilgisayar bağlantısı değiştiği için ses durdu. Bağlantıyı kontrol edip yeniden dene.", "Voice stopped because the computer connection changed. Check the connection and try again."),
  "Return to the original assistant conversation to keep its recognized text before recording again.": copy =>
    copy("Önceki kaydın metni başka bir konuşmada bekliyor. O konuşmayı açıp metni ekle.", "Text from your last recording is waiting in another conversation. Open it and add the text."),
  "Update Bycoda to use the native voice companion.": copy =>
    copy("Ses için bu telefondaki bycoda’yı güncelle.", "Update bycoda on this phone to use voice."),
  "Speech playback timed out.": copy =>
    copy("Sesli yanıt zaman aşımına uğradı.", "Speech playback timed out."),
  "Invalid speech sample rate.": copy =>
    copy("Bilgisayardan gelen ses çalınamadı.", "The audio from the computer could not be played."),
  "Microphone recording stopped unexpectedly.": copy =>
    copy("Mikrofon kaydı beklenmedik biçimde durdu.", "Microphone recording stopped unexpectedly."),
  "Invalid voice connection.": copy =>
    copy("Bilgisayarla ses bağlantısı kurulamadı.", "The voice connection to the computer could not be opened."),
  "Record at least a short phrase.": copy =>
    copy("En az kısa bir cümle kaydet.", "Record at least a short phrase."),
  "Speech recognition is not available on this phone. Choose your computer in Voice assistant settings.": copy =>
    copy("Bu telefonda yazıya çevirme kullanılamıyor. Ses ve mikrofon ayarlarından bilgisayarını seç.", "Transcription is not available on this phone. Choose your computer in Voice and microphone settings."),
  "Speech recognition permission is required. Enable it in phone settings.": copy =>
    copy("Konuşma tanıma izni gerekiyor. Telefon ayarlarından aç.", "Speech recognition permission is required. Enable it in phone settings."),
  "This phone cannot recognize speech in this language. Choose your computer in Voice assistant settings.": copy =>
    copy("Bu telefon bu dilde yazıya çeviremiyor. Ses ve mikrofon ayarlarından bilgisayarını seç.", "This phone cannot transcribe this language. Choose your computer in Voice and microphone settings."),
  "The phone's speech recognizer needs a network connection. Try again or choose your computer.": copy =>
    copy("Telefonun konuşma tanıma hizmeti internet bağlantısı istiyor. Yeniden dene ya da bilgisayarını seç.", "The phone's speech recognizer needs a network connection. Try again or choose your computer."),
  "Speech could not be recognized. Try again.": copy =>
    copy("Konuşma tanınamadı. Yeniden dene.", "Speech could not be recognized. Try again."),
  "The reply is too long to read aloud.": copy =>
    copy("Yanıt sesli okunamayacak kadar uzun.", "The reply is too long to read aloud."),
  "Invalid speech response.": copy =>
    copy("Bilgisayardan gelen ses yanıtı okunamadı.", "The speech response from the computer could not be read."),
  "Speech text contains an oversized character sequence.": copy =>
    copy("Yanıt sesli okunamayan karakterler içeriyor.", "The reply contains characters that cannot be read aloud."),
  "The message is too long. Shorten the draft before dictating.": copy =>
    copy("Taslak çok uzun. Sesle yazmadan önce kısalt.", "The draft is too long. Shorten it before dictating."),
  "Speech response is too large.": copy =>
    copy("Sesli yanıt çalınamayacak kadar uzun.", "The spoken reply is too long to play."),
  "The computer took too long to generate speech.": copy =>
    copy("Bilgisayar sesi zamanında üretemedi. Yeniden dene.", "The computer took too long to generate speech. Try again."),
  "The computer returned no speech audio.": copy =>
    copy("Bilgisayar ses göndermedi. Yeniden dene.", "The computer sent no audio. Try again."),
};

/**
 * A failure whose message is already a localized sentence for the owner (for example a composer
 * refusing recognized text while a send runs). It is shown as written, never replaced.
 */
export class LocalizedVoiceError extends Error {
  override name = "LocalizedVoiceError";
}

/** A localized sentence for any voice failure; Host errors keep the shared presenter's wording. */
export function assistantVoiceErrorMessage(error: unknown, copy: Copy, where?: { stage?: AssistantVoiceStage; computer: string }): string {
  if (error instanceof LocalizedVoiceError && error.message) return error.message;
  if (error instanceof AssistantCallError || error instanceof HostWsError || error instanceof RemoteHostError)
    return assistantCallErrorMessage(error, copy, where);
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const translate = known[text];
  if (translate) return translate(copy);
  const phone = voiceNativeMessage(error, copy);
  if (phone) return phone;
  // An unknown failure names no cause: blaming permission or setup misled the owner (a long draft, a slow computer).
  return copy("Ses kullanılamadı. Yeniden dene.", "Voice didn't work. Try again.");
}
