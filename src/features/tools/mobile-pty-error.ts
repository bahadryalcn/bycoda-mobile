type Copy = (tr: string, en: string) => string;

/** Exact known guard errors only; other host validation reasons remain diagnostic evidence. */
export function ptyRecoveryMessage(error: unknown, copy: Copy): string | undefined {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  if (message === "Terminal lifecycle requires the calling conversation active in its local project workspace.") return copy(
    "Bu konuşmayı bilgisayarda bycoda'nın ana penceresinde, kendi yerel projesinde açın ve seçili bırakın. Ardından telefonda terminali yeniden açın.",
    "Open this conversation in its local project in bycoda's main desktop window and keep it selected. Then reopen the terminal on your phone.",
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
  return undefined;
}
