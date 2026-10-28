import type { UserQuestionPrompt } from "./wire-types";

type Copy = (tr: string, en: string) => string;

/** Only provider-reported blocking questions may claim that work is waiting. */
export function questionStatusLabel(question: UserQuestionPrompt, copy: Copy): string {
  switch (question.delivery) {
    case "sending":
      return copy("Yanıt gönderiliyor…", "Sending answer…");
    case "queued":
      return copy("Yanıt kaydedildi · devam etmeyi bekliyor", "Answer saved · waiting to continue");
    case "unknown":
      return copy("Yanıtın teslimi doğrulanamadı", "Answer delivery not confirmed");
    case "failed":
      return copy("Yanıt gönderilemedi", "Answer not sent");
  }
  if (question.behavior === "blocking")
    return copy("Yanıtın bekleniyor", "Waiting for your answer");
  if (question.behavior === "nonBlocking")
    return copy("Açık soru · çalışma sürebilir", "Open question · work may continue");
  return copy("Açık soru", "Open question");
}

export function questionSubmissionHeld(question: UserQuestionPrompt): boolean {
  return question.delivery === "sending" || question.delivery === "queued" || question.delivery === "unknown";
}

export function questionNeedsAttention(question: UserQuestionPrompt): boolean {
  return question.delivery === "failed" || question.delivery === "unknown" ||
    (!questionSubmissionHeld(question) && question.behavior === "blocking");
}

export function questionDismissLabel(question: UserQuestionPrompt, copy: Copy): string {
  if (question.dismissAction === "cancel") return copy("Soruyu iptal et", "Cancel question");
  if (question.dismissAction === "decline") return copy("Reddet", "Decline");
  return copy("Atla", "Skip");
}
