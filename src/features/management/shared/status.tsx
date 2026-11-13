import { Badge } from "@/ui/primitives";
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
    cancelled: ["İptal edildi", "Cancelled"],
    failed: ["Başarısız", "Failed"],
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

export function Status({ value }: StatusProps) {
  const copy = useCopy();
  const tone = ["failed", "blocked"].includes(value)
    ? "danger"
    : ["done", "succeeded", "completed", "finished"].includes(value)
      ? "success"
      : ["review", "awaiting-approval"].includes(value)
        ? "warning"
        : ["running", "verifying", "planning", "active"].includes(value)
          ? "live"
          : "default";
  return (
    <Badge
      label={statusLabel(value, copy)}
      tone={tone}
    />
  );
}
