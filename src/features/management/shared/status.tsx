import { Badge } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { StatusProps } from "./types";

export function Status({ value }: StatusProps) {
  const copy = useCopy();
  const translated: Record<string, readonly [string, string]> = {
    idle: ["Hazır", "Ready"],
    todo: ["Yapılacak", "To do"],
    queued: ["Sırada", "Queued"],
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
  const tone = ["failed", "blocked"].includes(value)
    ? "danger"
    : ["done", "succeeded", "completed"].includes(value)
      ? "success"
      : ["review", "awaiting-approval"].includes(value)
        ? "warning"
        : ["running", "verifying", "planning"].includes(value)
          ? "live"
          : "default";
  return (
    <Badge
      label={translated[value] ? copy(...translated[value]) : value.replaceAll("-", " ")}
      tone={tone}
    />
  );
}
