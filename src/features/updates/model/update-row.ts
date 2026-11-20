export type UpdatePhase = "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "error";
export type UpdateAction = "check" | "download" | "restart";

/** Over-the-air updates exist only in a release build whose runtime has them switched on. */
export function updatesSupported(env: { dev: boolean; enabled: boolean; web: boolean }): boolean {
  return !env.dev && env.enabled && !env.web;
}

type Copy = (tr: string, en: string) => string;

/** Localized, actionable failure text per step; raw expo-updates messages are English-only. */
export function updateFailureMessage(action: UpdateAction, copy: Copy): string {
  switch (action) {
    case "restart":
      return copy(
        "Uygulama yeniden başlatılamadı. İndirilen güncelleme duruyor; yeniden başlatmayı tekrar dene.",
        "The app could not restart. The downloaded update is kept; try restarting again.",
      );
    case "download":
      return copy("Güncelleme indirilemedi. Bağlantını kontrol edip tekrar dene.", "The update could not be downloaded. Check your connection and try again.");
    default:
      return copy("Güncellemeler denetlenemedi. Bağlantını kontrol edip tekrar dene.", "Could not check for updates. Check your connection and try again.");
  }
}

/**
 * What the single Settings row shows and does in each phase; restart is always explicit.
 * In the `error` phase `failed` is the step that failed: the row retries exactly that step, so a
 * failed restart keeps offering the already downloaded update instead of re-checking.
 */
export function updateRow(
  phase: UpdatePhase,
  copy: Copy,
  failed: UpdateAction | null = null,
): { label: string; detail?: string; busy: boolean; action: UpdateAction | null } {
  switch (phase) {
    case "error": {
      const action = failed ?? "check";
      return {
        label:
          action === "restart"
            ? copy("Yeniden başlatmayı tekrar dene", "Try restarting again")
            : copy("Tekrar dene", "Try again"),
        detail: action === "restart" ? copy("Güncelleme indirildi.", "The update is downloaded.") : undefined,
        busy: false,
        action,
      };
    }
    case "checking":
      return { label: copy("Güncelleme aranıyor…", "Checking for updates…"), busy: true, action: null };
    case "available":
      return {
        label: copy("Güncellemeyi indir", "Download update"),
        detail: copy("Yeni bir sürüm hazır.", "A new version is available."),
        busy: false,
        action: "download",
      };
    case "downloading":
      return { label: copy("Güncelleme indiriliyor…", "Downloading update…"), busy: true, action: null };
    case "ready":
      return {
        label: copy("Yeniden başlat ve uygula", "Restart to apply"),
        detail: copy("Güncelleme indirildi.", "The update is downloaded."),
        busy: false,
        action: "restart",
      };
    case "current":
      return {
        label: copy("Güncellemeleri denetle", "Check for updates"),
        detail: copy("Uygulama güncel.", "You are up to date."),
        busy: false,
        action: "check",
      };
    default:
      return { label: copy("Güncellemeleri denetle", "Check for updates"), busy: false, action: "check" };
  }
}
