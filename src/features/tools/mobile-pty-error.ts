type Copy = (tr: string, en: string) => string;

export function isPtyDesktopOffline(error: unknown): boolean {
  const message = error instanceof Error ? error.message : error;
  return message === "Desktop relay is offline. Open the updated bycoda desktop connected to this host.";
}

/** Exact known guard errors only; other host validation reasons remain diagnostic evidence. */
export function ptyRecoveryMessage(error: unknown, copy: Copy): string | undefined {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  if (message === "Mobile PTY close is not confirmed.") return copy(
    "Terminalin kapandığı doğrulanmadı. Bu görünümü açık tutup kapatma durumunu kontrol et.",
    "Terminal closure is not confirmed. Keep this view open and check the close status.",
  );
  if (message === "Terminal lifecycle requires the calling conversation active in its local project workspace.") return copy(
    "Bu oturumu bilgisayarda bycoda'nın ana penceresinde, kendi yerel projesinde aç ve seçili bırak. Ardından telefonda terminali yeniden aç.",
    "Open this session in its local project in bycoda's main desktop window and keep it selected. Then reopen the terminal on your phone.",
  );
  if (message === "Reviewed machine is unavailable") return copy(
    "Önce bir bilgisayara bağlanın, ardından terminali yeniden açın.",
    "Connect a computer first, then reopen the terminal.",
  );
  if (message === "Mobile PTY source changed; never replay input" ||
      message === "Saved PTY creation belongs to a different reviewed connection; no operation was sent") return copy(
    "Bilgisayar bağlantısı değişti. Doğru bilgisayarı seçip terminali yeniden açın. Eski giriş yeniden gönderilmedi.",
    "The computer connection changed. Select the correct computer and reopen the terminal. Previous input was not replayed.",
  );
  if (message === "Mobile PTY source is unavailable") return copy(
    "Terminal bağlantısı şu anda kullanılamıyor. Uygulamanın kilidini açın, bilgisayar bağlantısını kontrol edip terminali yeniden açın.",
    "The terminal connection is unavailable. Unlock the app, check the computer connection and reopen the terminal.",
  );
  if (message === "PTY input outcome is unknown; never resend") return copy(
    "Son yazılanın terminale ulaşıp ulaşmadığı bilinmiyor; yeniden gönderilmedi. Sürdür'e dokunup ekrana bakın.",
    "It is unknown whether the last input reached the terminal; it was not sent again. Tap Resume and check the screen.",
  );
  if (message === "PTY input is backed up; unsent input was discarded") return copy(
    "Terminal girişe yetişemedi; gönderilmeyen giriş atıldı. Sürdür'e dokunup yeniden yazın.",
    "The terminal could not keep up; unsent input was discarded. Tap Resume and type it again.",
  );
  if (message === "Mobile PTY creation failed; inspect before clearing the saved attempt") return copy(
    "Terminal oluşturulamadı. Kaydı temizleyip yeniden deneyin.",
    "The terminal could not be created. Clear the attempt and try again.",
  );
  if (message === "Invalid PTY output stream" || message === "PTY byte cursor changed") return copy(
    "Terminal çıktısı okunamadı. Terminali yeniden açın.",
    "The terminal output could not be read. Reopen the terminal.",
  );
  return undefined;
}
