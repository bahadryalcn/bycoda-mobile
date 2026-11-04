import { Body, ErrorText, FormActions, Notice } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { AccountMetadataChange, AccountMetadataDraft } from "./provider-account-draft";

/** Delivery state takes priority over an earlier review; recovery only reads the saved result. */
export function ProviderAccountActions({ value, review, applied, current, disabled, busy, error,
  onReview, onConfirm, onCancelReview, onReconcile, onClose }: {
  value?: AccountMetadataDraft | null;
  review?: AccountMetadataChange;
  applied: boolean;
  current: boolean;
  disabled: boolean;
  busy: boolean;
  error: unknown;
  onReview: () => void;
  onConfirm: () => void;
  onCancelReview: () => void;
  onReconcile: () => void;
  onClose: () => void;
}) {
  const copy = useCopy();
  const failure = <ErrorText error={error} />;
  if (value?.pending) return <FormActions
    submitLabel={copy("Sonucu oku", "Read result")} disabled={!current} busy={busy}
    onSubmit={onReconcile} cancelLabel={copy("Kapat", "Close")} onCancel={onClose}
    feedback={<>{failure}<Notice tone="warning" message={copy(
      "Kaydedilen işlemin yalnız sonucu okunur; istek yeniden gönderilmez.",
      "Only the saved operation's result is read; the request is never resent.",
    )} /></>} />;
  if (value?.finished) return <FormActions
    submitLabel={copy("Kapat", "Close")} onSubmit={onClose} disabled={busy} tone="default"
    feedback={<>{failure}<Notice tone={applied ? "success" : "warning"} message={
      applied && value.kind === "quotaRefresh" ? copy(
        "Kota gözlemi tamamlandı. Sonucu güncellenen hesap listesinde görün.",
        "Quota observation completed. View the result in the refreshed account list.",
      ) : applied ? copy(
        "Hesap ayarları kaydedildi. Yeni bir değişiklik için güncel listeyi yeniden açın.",
        "Account settings saved. Reopen the refreshed list for another change.",
      ) : copy(
        "Değişiklik uygulanamadı. Güncel listeyi açıp yeniden inceleyin.",
        "The change could not be applied. Open the refreshed list and review again.",
      )} /></>} />;
  if (review) return <FormActions
    submitLabel={review.kind === "quotaRefresh" ? copy("Kotayı yenile", "Refresh quota") : copy("Kaydet", "Save")}
    disabled={disabled} busy={busy} onSubmit={onConfirm}
    cancelLabel={copy("Vazgeç", "Cancel")} onCancel={onCancelReview}
    feedback={failure} />;
  return <FormActions
    submitLabel={value?.kind === "quotaRefresh" ? copy("İsteği incele", "Review request") : copy("Değişiklikleri incele", "Review changes")}
    disabled={disabled} busy={busy} onSubmit={onReview}
    cancelLabel={copy("Kapat", "Close")} onCancel={onClose} feedback={failure} />;
}

export function ProviderAccountReview({ review }: { review?: AccountMetadataChange }) {
  const copy = useCopy();
  return review ? <Body>{review.kind === "quotaRefresh" ? copy(
      "Bu hesabın Claude kotası bilgisayardan bir kez sorgulansın mı?",
      "Read this account's Claude quota once from the computer?",
    ) : review.kind === "default" ? copy(
      "Bu hesabı bu sağlayıcının gelecekteki konuşmaları için varsayılan yap?",
      "Make this account the default for this provider's future conversations?",
    ) : copy(
      "İncelenen hesap ayarını bilgisayara kaydet?", "Save the reviewed account setting on the computer?",
    )}</Body> : null;
}
