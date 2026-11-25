import { HostWsError } from "@/remote/ws-connection";
import { RemoteHostError } from "@/remote/host-error";

type Copy = (turkish: string, english: string, values?: Record<string, string | number>) => string;

/**
 * Why the computer refused a voice request, in its own words. Over the phone's socket the Host's
 * reason rides beside the generic "not ready" sentence, so voice failures read as the actual cause
 * (setup running, settings in use, model missing) instead of "This computer is not ready".
 */
export function voiceHostReason(error: unknown): string | undefined {
  if (error instanceof HostWsError) return error.category === "unavailable" ? error.hostReason : undefined;
  if (error instanceof RemoteHostError && error.kind === "host" && !error.uncertain) return error.message;
  return undefined;
}

/** Host refusals after which reopening the voice line starts voice again; any other reason would repeat. */
const reopenable = new Set(["Voice connection expired. Start voice again.", "Local voice disconnected."]);

/** The Host answered with a reason the same request would get again, so the voice line itself is fine. */
export function voiceHostRefused(error: unknown): boolean {
  const reason = error instanceof HostWsError && !error.uncertain ? voiceHostReason(error) : undefined;
  return reason !== undefined && !reopenable.has(reason);
}

const SETUP_INCOMPLETE = /^Voice setup is incomplete: (.+?)\. Open Settings/;

const known: Record<string, (copy: Copy) => string> = {
  "Voice setup is still running.": copy =>
    copy("Bilgisayarda ses kurulumu sürüyor. Bitince yeniden dene.", "Voice setup is still running on the computer. Try again when it finishes."),
  "A voice model action is running.": copy =>
    copy("Bilgisayarda bir ses modeli kuruluyor veya kaldırılıyor. Bitince yeniden dene.", "A voice model is being installed or removed on the computer. Try again when it finishes."),
  // Hosts before shared phone voice refuse a phone whose voice settings differ from the computer's.
  "Voice settings changed. Disconnect voice in other windows before reconnecting.": copy => alreadyInUse(copy),
  "Another voice configuration is connected.": copy => alreadyInUse(copy),
  "Voice is in use on this computer without spoken replies. End voice on the computer, then try again.": copy =>
    copy("Bilgisayarda ses, sesli yanıt olmadan kullanılıyor. Bilgisayarda sesi kapatıp yeniden dene.", "Voice is in use on this computer without spoken replies. End voice on the computer, then try again."),
  "Local voice needs Python, faster-whisper and a cached Whisper model on this computer.": copy => recognizerFailed(copy),
  "The local GGUF model could not be loaded.": copy => recognizerFailed(copy),
  "Local voice startup timed out.": copy => startTimedOut(copy),
  "Natural voice startup timed out.": copy => startTimedOut(copy),
  "Voice connection expired. Start voice again.": copy =>
    copy("Ses bağlantısının süresi doldu. Sesi yeniden başlat.", "The voice connection expired. Start voice again."),
  "Local voice disconnected.": copy =>
    copy("Bilgisayardaki ses durdu. Sesi yeniden başlat.", "Voice stopped on the computer. Start voice again."),
  "Speech recognition is busy. Please speak again after transcription.": copy =>
    copy("Bilgisayar önceki konuşmayı hâlâ yazıya döküyor. Bitince yeniden konuş.", "The computer is still transcribing. Speak again when it finishes."),
  "Local speech recognition timed out.": copy =>
    copy("Bilgisayarda konuşma tanıma çok uzun sürdü. Yeniden dene.", "Speech recognition on the computer took too long. Try again."),
  "Local speech recognition failed.": copy =>
    copy("Bilgisayarda konuşma tanıma başarısız oldu. Yeniden dene.", "Speech recognition on the computer failed. Try again."),
  "Add your ElevenLabs API key in Chat settings.": copy =>
    copy("ElevenLabs sesi için API anahtarı gerekiyor. Bilgisayarda Sohbet ayarlarına ekle veya başka bir ses seç.", "The ElevenLabs voice needs an API key. Add it in Chat settings on the computer, or choose another voice."),
};

function alreadyInUse(copy: Copy) {
  return copy(
    "Bilgisayar sesi başka ayarlarla kullanıyor. Bilgisayarda sesi kapatıp yeniden dene veya telefonun katılabilmesi için bilgisayardaki Bycoda’yı güncelle.",
    "The computer is using voice with other settings. End voice on the computer and try again, or update Bycoda on the computer so this phone can join it.",
  );
}
function recognizerFailed(copy: Copy) {
  return copy(
    "Bilgisayarın konuşma tanıma modeli başlatılamadı. Bilgisayarda Ayarlar → Sesli asistan bölümünden ses kurulumunu kontrol et.",
    "The computer's speech recognizer could not start. On the computer, open Settings → Voice assistant and check the voice setup.",
  );
}
function startTimedOut(copy: Copy) {
  return copy("Ses bilgisayarda çok geç başladı. Yeniden dene.", "Voice took too long to start on the computer. Try again.");
}

/** A localized sentence for a known Host voice refusal; any other Host reason is shown as sent. */
export function voiceHostMessage(error: unknown, copy: Copy): string | undefined {
  const reason = voiceHostReason(error);
  if (!reason) return undefined;
  const translate = known[reason];
  if (translate) return translate(copy);
  const missing = SETUP_INCOMPLETE.exec(reason)?.[1];
  if (missing)
    return copy(
      "Bilgisayarda ses kurulumu eksik: {p0}. Bilgisayarda Ayarlar → Sesli asistan bölümünü açıp eksik dosyaları kur.",
      "Voice is not set up on the computer (missing: {p0}). On the computer, open Settings → Voice assistant and install the missing files.",
      { p0: missing },
    );
  // An HTTP Host error is already shown as sent by the shared presenter.
  return error instanceof HostWsError ? reason : undefined;
}
