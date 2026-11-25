import { Badge, StatusText } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { StatusProps } from "./types";

export function statusLabel(value: string, copy: (tr: string, en: string) => string): string {
  const translated: Record<string, readonly [string, string]> = {
    idle: ["Hazır", "Ready"],
    active: ["Etkin", "Active"],
    finished: ["Tamamlandı", "Completed"],
    todo: ["Yapılacak", "To do"],
    queued: ["Sırada", "Queued"],
    waiting: ["Bekliyor", "Waiting"],
    running: ["Çalışıyor", "Running"],
    verifying: ["Doğrulanıyor", "Verifying"],
    review: ["İncelemede", "In review"],
    done: ["Tamamlandı", "Done"],
    blocked: ["Engellendi", "Blocked"],
    planning: ["Planlanıyor", "Planning"],
    "awaiting-approval": ["Onay bekliyor", "Awaiting approval"],
    "needs-input": ["Yanıt bekliyor", "Needs input"],
    cancelled: ["İptal edildi", "Cancelled"],
    failed: ["Başarısız", "Failed"],
    skipped: ["Atlanan", "Skipped"],
    succeeded: ["Başarılı", "Succeeded"],
    completed: ["Tamamlandı", "Completed"],
    comment: ["Yorum", "Comment"],
    message: ["Mesaj", "Message"],
    reply: ["Yanıt", "Reply"],
    draft: ["Taslak", "Draft"],
    pending: ["Bekliyor", "Pending"],
    paused: ["Duraklatıldı", "Paused"],
  };
  return translated[value] ? copy(...translated[value]) : value.replaceAll("-", " ");
}

/**
 * Record status. Normal and progressing states are quiet `StatusText` (running/planning carry the
 * live tone and dot; finished work is muted); only states the user must act on or notice get a
 * tinted `Badge`.
 */
export function statusTone(value: string): "danger" | "warning" | "live" | "default" {
  return ["failed", "blocked"].includes(value)
    ? "danger"
    : ["review", "awaiting-approval", "needs-input"].includes(value)
      ? "warning"
      : ["running", "verifying", "planning", "active"].includes(value)
        ? "live"
        : "default";
}

export function Status({ value }: StatusProps) {
  const copy = useCopy();
  const tone = statusTone(value);
  const label = statusLabel(value, copy);
  return tone === "danger" || tone === "warning"
    ? <Badge label={label} tone={tone} />
    : <StatusText label={label} tone={tone} />;
}
