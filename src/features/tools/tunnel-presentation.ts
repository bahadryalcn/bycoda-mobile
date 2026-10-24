type TunnelState = "starting" | "ready" | "stopping" | "stopped" | "error" | "interrupted";

/** A ready process does not prove that its public address can be reached. */
export function tunnelPresentation(state: TunnelState) {
  switch (state) {
    case "starting":
      return { label: ["Başlatılıyor", "Starting"] as const, tone: "info" as const };
    case "ready":
      return { label: ["Hazır", "Ready"] as const, tone: "success" as const };
    case "stopping":
      return { label: ["Durduruluyor", "Stopping"] as const, tone: "info" as const };
    case "stopped":
      return { label: ["Durduruldu", "Stopped"] as const, tone: "default" as const };
    case "error":
      return { label: ["Hata", "Error"] as const, tone: "danger" as const };
    case "interrupted":
      return { label: ["Kesildi", "Interrupted"] as const, tone: "warning" as const };
  }
}
