import { useEffect } from "react";

import { useCopy } from "@/ui/copy";
import { ToggleField } from "@/ui/fields";
import { Notice, SegmentedRow } from "@/ui/primitives";

import { useWidgetPreferences } from "./model/widget-preferences";
import { useUsageWidgetPreferences } from "./model/usage-widget-preferences";
import { usageWindowOptions } from "./model/usage-widget";

/** Opt-in for session titles on home and lock screen widgets, which sit outside the app lock. */
export function WidgetSettings() {
  const copy = useCopy();
  const showTitles = useWidgetPreferences((state) => state.showTitles);
  const showQuestionText = useWidgetPreferences((state) => state.showQuestionText);
  const setShowQuestionText = useWidgetPreferences((state) => state.setShowQuestionText);
  const hydrate = useWidgetPreferences((state) => state.hydrate);
  const setShowTitles = useWidgetPreferences((state) => state.setShowTitles);
  const hydrated = useWidgetPreferences((state) => state.hydrated);
  const pending = useWidgetPreferences((state) => state.pending);
  const storageError = useWidgetPreferences((state) => state.storageError);
  const retryStorage = useWidgetPreferences((state) => state.retryStorage);
  const usageWindows = useUsageWidgetPreferences((state) => state.windows);
  const usageHydrated = useUsageWidgetPreferences((state) => state.hydrated);
  const hydrateUsage = useUsageWidgetPreferences((state) => state.hydrate);
  const setUsageWindows = useUsageWidgetPreferences((state) => state.setWindows);
  useEffect(() => {
    // Read the stored privacy choice before the editor may change it.
    void hydrate();
    void hydrateUsage();
  }, [hydrate, hydrateUsage]);
  return (
    <>
      <SegmentedRow
        label={copy("Kullanım limitleri", "Usage limits")}
        value={usageWindows}
        disabled={!usageHydrated}
        options={usageWindowOptions(copy)}
        onChange={(value) => {
          void setUsageWindows(value);
        }}
      />
      <ToggleField
        label={copy("Oturum başlıklarını göster", "Show session titles")}
        help={copy(
          "Widget'lar uygulama kilidinin dışında görünür. Kapalıyken yalnızca proje adları görünür.",
          "Widgets are visible without the app lock. When off, only project names appear.",
        )}
        value={showTitles}
        disabled={!hydrated || !!pending}
        detail={
          pending === "read"
            ? copy("Yükleniyor…", "Loading…")
            : storageError?.operation === "read"
              ? copy("Kullanılamıyor", "Unavailable")
              : !hydrated
                ? copy("Yükleniyor…", "Loading…")
                : pending === "save"
                  ? copy("Ayarlar kaydediliyor…", "Saving settings…")
                  : storageError
                    ? copy("Kaydedilmedi", "Unsaved")
                    : undefined
        }
        onChange={(value) => {
          void setShowTitles(value);
        }}
      />
      {/* Depends on titles: disabled (not hidden) while titles are off, so the dependency is visible. */}
      <ToggleField
        label={copy("Soru metnini göster", "Show question text")}
        help={copy(
          "Bekleyen sorunun metni ana ekranda görünür. Önce oturum başlıklarını aç.",
          "Pending question text appears on your home screen. Turn on session titles first.",
        )}
        detail={!showTitles ? copy("Oturum başlıkları kapalıyken kullanılmaz", "Not used while session titles are off") : undefined}
        value={showQuestionText && showTitles}
        disabled={!hydrated || !!pending || !showTitles}
        onChange={(value) => {
          void setShowQuestionText(value);
        }}
      />
      {storageError ? (
        <Notice
          tone="warning"
          retrying={!!pending}
          message={
            storageError.operation === "read"
              ? copy(
                  "Widget tercihi okunamadı. Yeniden deneyene kadar oturum başlıkları gizli kalır.",
                  "Widget preference could not be read. Session titles stay hidden until you retry.",
                )
              : copy(
                  "Widget tercihi kaydedilmedi. Seçimin bu oturum için korundu. Kaydetmeyi yeniden dene.",
                  "Widget preference is not saved. Your choice is kept for this session. Retry saving.",
                )
          }
          onRetry={() => {
            void retryStorage(storageError);
          }}
        />
      ) : null}
    </>
  );
}
