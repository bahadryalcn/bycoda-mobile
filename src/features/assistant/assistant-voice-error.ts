import { errorMessage } from "@/ui/error-message";
import { HostWsError } from "@/remote/ws-connection";
import { RemoteHostError } from "@/remote/host-error";
import { AssistantCallError, assistantCallErrorMessage } from "./assistant-call-error";
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
    copy("Tanınan bir konuşma metni geri alınmayı bekliyor.", "A recognized speech draft is awaiting recovery."),
  "End the voice call before starting dictation or read aloud.": copy =>
    copy("Sesle yazmadan veya sesli okumadan önce sesli görüşmeyi bitir.", "End the voice call before starting dictation or read aloud."),
  "The assistant computer connection is unavailable.": copy =>
    copy("Asistanın bilgisayar bağlantısı kullanılamıyor.", "The assistant computer connection is unavailable."),
  "Voice stopped because the computer connection changed. Check the connection and try again.": copy =>
    copy("Bilgisayar bağlantısı değiştiği için ses durdu. Bağlantıyı kontrol edip yeniden dene.", "Voice stopped because the computer connection changed. Check the connection and try again."),
  "Return to the original assistant conversation to keep its recognized text before recording again.": copy =>
    copy("Yeniden kaydetmeden önce tanınan metni korumak için ilk asistan konuşmasına dön.", "Return to the original assistant conversation to keep its recognized text before recording again."),
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
  "Speech could not be recognized. Try again.": copy =>
    copy("Konuşma tanınamadı. Yeniden dene.", "Speech could not be recognized. Try again."),
  "The reply is too long to read aloud.": copy =>
    copy("Yanıt sesli okunamayacak kadar uzun.", "The reply is too long to read aloud."),
  "Invalid speech response.": copy =>
    copy("Bilgisayardan gelen ses yanıtı okunamadı.", "The speech response from the computer could not be read."),
  "Speech text contains an oversized character sequence.": copy =>
    copy("Yanıt sesli okunamayan karakterler içeriyor.", "The reply contains characters that cannot be read aloud."),
};

/** A localized sentence for any voice failure; Host errors keep the shared presenter's wording. */
export function assistantVoiceErrorMessage(error: unknown, copy: Copy, where?: { stage?: AssistantVoiceStage; computer: string }): string {
  if (error instanceof AssistantCallError || error instanceof HostWsError || error instanceof RemoteHostError)
    return where ? assistantCallErrorMessage(error, copy, where) : error instanceof AssistantCallError ? assistantCallErrorMessage(error, copy) : errorMessage(error, copy);
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const translate = known[text];
  if (translate) return translate(copy);
  return copy("Ses kullanılamıyor. Mikrofon iznini ve bilgisayardaki ses kurulumunu kontrol et.",
    "Voice is unavailable. Check microphone permission and voice setup on your computer.");
}
