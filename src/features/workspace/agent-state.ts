import type { AgentEntry } from "./agents-model";

type Copy = (tr: string, en: string) => string;
type Colors = { info: string; danger: string; warning: string; success: string; muted: string };

export function agentStateLabel(state: AgentEntry["state"], copy: Copy) {
  switch (state) {
    case "running": return copy("Çalışıyor", "Working");
    case "queued": return copy("Sırada", "Queued");
    case "failed": return copy("Başarısız", "Failed");
    case "cancelled": return copy("İptal edildi", "Cancelled");
    case "stopped": return copy("Durduruldu", "Stopped");
    case "interrupted": return copy("Kesildi", "Interrupted");
    case "neutral": return copy("Bilinmiyor", "Unknown");
    case "completed": return copy("Tamamlandı", "Done");
  }
}

export function agentStateTone(state: AgentEntry["state"], colors: Colors) {
  switch (state) {
    case "running": return colors.info;
    case "failed": return colors.danger;
    case "stopped":
    case "interrupted": return colors.warning;
    case "completed": return colors.success;
    case "queued":
    case "cancelled":
    case "neutral": return colors.muted;
  }
}
