import { ChatAppearanceStorageError } from "@/state/chat-appearance-model";
import type { useCopy } from "@/ui/copy";

export function chatAppearanceFeedback(error: Error | null, copy: ReturnType<typeof useCopy>) {
  if (!error) return null;
  const operation = error instanceof ChatAppearanceStorageError ? error.operation : undefined;
  return {
    retryable: !!operation,
    summary: operation === "save" ? copy("Kaydedilmedi", "Not saved") : copy("Tercih kullanılamıyor", "Preference unavailable"),
    message: operation === "read"
      ? copy("Kaydedilmiş yazı boyutu okunamadı. Yeniden dene veya bir boyut seç.", "The saved text size could not be read. Retry or choose a size.")
      : operation === "save"
        ? copy("Yazı boyutu değişti, ancak bu telefona kaydedilemedi. Bu seçimi kaydetmek için yeniden dene.", "Text size changed, but could not be saved on this phone. Retry to keep this choice.")
        : copy("Yazı boyutu tercihi kullanılamıyor. Yeniden denemek için bir boyut seç.", "The text size preference is unavailable. Choose a size to retry."),
  };
}
