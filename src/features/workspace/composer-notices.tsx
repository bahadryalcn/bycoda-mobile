import { useMobileTheme } from "@/ui/theme";
import { Body, Button, ErrorNotice } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { composerDeliveryError } from "./composer-delivery-copy";
import type { ComposerDelivery } from "./composer-delivery";

/** Quiet state lines under the capsule; nothing renders (and nothing is reserved) when idle. */
export function ComposerNotices({
  error,
  mode,
  running,
  queueSupported,
  desktopOwned,
  missingRun,
  cancellable,
  onCancelUpload,
  draftError,
  ready,
  retrying,
  onRetryDraft,
  onRetrySend,
  sending,
}: {
  error: unknown;
  mode: ComposerDelivery;
  running: boolean;
  queueSupported: boolean;
  desktopOwned: boolean;
  missingRun: boolean;
  cancellable: boolean;
  onCancelUpload: () => void;
  draftError: boolean;
  ready: boolean;
  retrying: boolean;
  onRetryDraft: () => void;
  onRetrySend?: () => void;
  sending?: boolean;
}) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  return (
    <>
      {cancellable ? (
        <Button tone="quiet" density="compact" label={copy("Yüklemeyi iptal et", "Cancel upload")} onPress={onCancelUpload} />
      ) : null}
      <ErrorNotice
        error={error}
        message={composerDeliveryError(error, copy)}
        onRetry={draftError ? undefined : onRetrySend}
        retrying={sending}
      />
      {mode === "send" && running && !queueSupported ? (
        <Body muted style={uiStyles.caption}>
          {copy("Bu turun bitmesini bekle.", "Wait for this turn to finish.")}
        </Body>
      ) : null}
      {mode === "steer" && running && desktopOwned ? (
        <Body muted style={uiStyles.caption}>
          {copy(
            "Bu tur masaüstü uygulamasında çalışıyor. Oradan yönlendir veya mesajı sıraya al.",
            "This turn is running in the desktop app. Steer it there or queue your message.",
          )}
        </Body>
      ) : mode === "steer" && running && missingRun ? (
        <Body muted style={uiStyles.caption}>
          {composerDeliveryError(new Error("Refresh the running turn before steering it."), copy)}
        </Body>
      ) : null}
      {draftError ? (
        <Button
          busy={retrying}
          label={
            ready
              ? copy("Taslağı kaydetmeyi yeniden dene", "Retry saving draft")
              : copy("Taslağı yeniden yükle", "Retry loading draft")
          }
          onPress={onRetryDraft}
        />
      ) : null}
      {(mode === "steer" && !running) || (mode === "queue" && !queueSupported) ? (
        <Body muted style={uiStyles.caption}>
          {mode === "steer"
            ? copy("Yönlendirmek için çalışan bir tur gerekiyor.", "Steering requires a running turn.")
            : copy(
                "Bu bilgisayarda sıra desteklenmiyor. Çalışmanın bitmesini bekle.",
                "This computer does not support queuing. Wait for the turn to finish.",
              )}
        </Body>
      ) : null}
    </>
  );
}
