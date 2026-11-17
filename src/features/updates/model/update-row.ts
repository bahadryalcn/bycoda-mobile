export type UpdatePhase = "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "error";
export type UpdateAction = "check" | "download" | "restart";

/** Over-the-air updates exist only in a release build whose runtime has them switched on. */
export function updatesSupported(env: { dev: boolean; enabled: boolean; web: boolean }): boolean {
  return !env.dev && env.enabled && !env.web;
}

/** What the single Settings row shows and does in each phase; restart is always explicit. */
export function updateRow(
  phase: UpdatePhase,
  copy: (tr: string, en: string) => string,
): { label: string; detail?: string; busy: boolean; action: UpdateAction | null } {
  switch (phase) {
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
