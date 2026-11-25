type Copy = (turkish: string, english: string, values?: Record<string, string | number>) => string;

/**
 * The phone's voice module rejects with its own English sentence wrapped by Expo
 * ("Call to function … has been rejected. → Caused by: …"), so each one is matched inside the text.
 * Without this the owner read either that wrapper or a line blaming the computer's voice setup for
 * a phone microphone problem.
 */
const native: [string, (copy: Copy) => string][] = [
  ["Start voice while Bycoda is visible, unlocked and microphone permission is granted.", copy =>
    copy("Sesi başlatmak için bycoda açık ve kilitsiz olmalı, mikrofon izni de verilmiş olmalı.", "To start voice, keep bycoda open and unlocked and allow microphone access.")],
  ["A voice session is already active.", copy =>
    copy("Başka bir ses oturumu hâlâ açık. Onu bitirip yeniden dene.", "Another voice session is still open. End it, then try again.")],
  ["Audio is in use by another app.", copy =>
    copy("Telefonun sesi başka bir uygulama tarafından kullanılıyor. O uygulamayı kapatıp yeniden dene.", "Another app is using the phone's audio. Close it, then try again.")],
  ["Microphone permission is required.", copy =>
    copy("Mikrofon izni gerekiyor. Telefon ayarlarından aç.", "Microphone permission is required. Enable it in phone settings.")],
  ["Microphone is muted or already recording.", copy =>
    copy("Mikrofon kapalı veya zaten kayıtta. Sesi açıp yeniden dene.", "The microphone is muted or already recording. Unmute it, then try again.")],
  ["Microphone configuration is unavailable.", copy => microphoneFailed(copy)],
  ["Microphone could not start.", copy => microphoneFailed(copy)],
  ["Microphone read failed.", copy => microphoneFailed(copy)],
  ["Voice session is unavailable.", copy => sessionEnded(copy)],
  ["Voice session was revoked.", copy => sessionEnded(copy)],
  ["Voice session stopped.", copy => sessionEnded(copy)],
  ["The voice session is unavailable.", copy => sessionEnded(copy)],
  ["Speech playback failed", copy =>
    copy("Yanıt bu telefonda çalınamadı. Yeniden dene.", "The reply could not be played on this phone. Try again.")],
];

function microphoneFailed(copy: Copy) {
  return copy("Telefonun mikrofonu açılamadı. Mikrofonu kullanan diğer uygulamaları kapatıp yeniden dene.",
    "The phone's microphone could not start. Close other apps using the microphone, then try again.");
}
function sessionEnded(copy: Copy) {
  return copy("Ses oturumu kapandı. Sesi yeniden başlat.", "The voice session ended. Start voice again.");
}

/** A localized sentence for a failure the phone's voice module reported, or undefined for any other error. */
export function voiceNativeMessage(error: unknown, copy: Copy): string | undefined {
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!text) return undefined;
  return native.find(([needle]) => text.includes(needle))?.[1](copy);
}
