import { questionNeedsAttention, questionStatusLabel } from "./question-status";
import type { HostSession } from "./wire";

type Copy = (tr: string, en: string) => string;
export type SessionHeaderTone = "danger" | "warning" | "live" | "muted";

/** One status label and dot tone for the header subtitle. */
export function sessionHeaderStatus(
  session: HostSession | undefined,
  failed: boolean,
  copy: Copy,
  /** The connection is paused; the shown session is the last received one. */
  paused = false,
): { label: string; tone: SessionHeaderTone } {
  if (!session)
    return failed
      ? { label: copy("Durum yüklenemedi", "Status unavailable"), tone: "danger" }
      : { label: copy("Yükleniyor", "Loading"), tone: "muted" };
  // Connection loss lives in the header, so the transcript never shifts for a banner.
  if (failed || paused) return { label: copy("Çevrimdışı", "Offline"), tone: "warning" };
  const question = session.session.pendingQuestion;
  if (question)
    return {
      label: questionStatusLabel(question, copy),
      tone: questionNeedsAttention(question) ? "warning" : session.status === "running" ? "live" : "muted",
    };
  // A run blocked on an undecided tool approval is waiting for the owner, not working.
  if (session.status === "running" && session.session.blocks?.some((block) => block.approval && !block.approval.decided))
    return { label: copy("Onayını bekliyor", "Waiting for your approval"), tone: "warning" };
  if (session.status === "running") return { label: copy("Çalışıyor", "Running"), tone: "live" };
  if (session.status === "interrupted") return { label: copy("Durduruldu", "Interrupted"), tone: "warning" };
  return { label: copy("Hazır", "Ready"), tone: "muted" };
}
