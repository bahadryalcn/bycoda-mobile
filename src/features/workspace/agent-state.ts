import type { AgentEntry } from "./agents-model";

type Copy = (tr: string, en: string) => string;
type Colors = { info: string; danger: string; warning: string; success: string };

export const agentStateLabel = (state: AgentEntry["state"], copy: Copy) =>
  state === "running" ? copy("Çalışıyor", "Working") : state === "failed" ? copy("Başarısız", "Failed")
    : state === "stopped" || state === "interrupted" ? copy("Durduruldu", "Interrupted") : copy("Tamamlandı", "Done");

export const agentStateTone = (state: AgentEntry["state"], colors: Colors) =>
  state === "running" ? colors.info : state === "failed" ? colors.danger : state === "stopped" || state === "interrupted" ? colors.warning : colors.success;
