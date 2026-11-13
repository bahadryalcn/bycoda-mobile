import { useEffect, type ReactNode } from "react";

import { useCopy } from "@/ui/copy";
import { ToggleField } from "@/ui/fields";
import { Notice } from "@/ui/primitives";

import { useWidgetPreferences } from "./model/widget-preferences";

/** Opt-in for session titles on home and lock screen widgets, which sit outside the app lock. */
export function WidgetSettings({ icon }: { icon?: ReactNode }) {
  const copy = useCopy();
  const showTitles = useWidgetPreferences((state) => state.showTitles);
  const hydrate = useWidgetPreferences((state) => state.hydrate);
  const setShowTitles = useWidgetPreferences((state) => state.setShowTitles);
  const hydrated = useWidgetPreferences((state) => state.hydrated);
  const pending = useWidgetPreferences((state) => state.pending);
  const storageError = useWidgetPreferences((state) => state.storageError);
  const retryStorage = useWidgetPreferences((state) => state.retryStorage);
  useEffect(() => {
    // Read the stored privacy choice before the editor may change it.
    void hydrate();
  }, [hydrate]);
  return (
    <>
    <ToggleField
      icon={icon}
      label={copy("Oturum başlıklarını widget'larda göster", "Show session titles on widgets")}
      help={copy(
        "Widget'lar uygulama kilidinin dışında görünür. Kapalıyken yalnızca proje adları görünür.",
        "Widgets are visible without the app lock. When off, only project names appear.",
      )}
      value={showTitles}
      disabled={!hydrated || !!pending}
      detail={pending === "read" ? copy("Yükleniyor…", "Loading…") : storageError?.operation === "read" ? copy("Kullanılamıyor", "Unavailable") : !hydrated ? copy("Yükleniyor…", "Loading…") : pending === "save" ? copy("Ayarlar kaydediliyor…", "Saving settings…") : storageError ? copy("Kaydedilmedi", "Unsaved") : undefined}
      onChange={(value) => { void setShowTitles(value); }}
    />
    {storageError ? <Notice tone="warning" retrying={!!pending}
      message={storageError.operation === "read"
        ? copy("Widget tercihi okunamadı. Yeniden deneyene kadar oturum başlıkları gizli kalır.", "Widget preference could not be read. Session titles stay hidden until you retry.")
        : copy("Widget tercihi kaydedilmedi. Seçimin bu oturum için korundu. Kaydetmeyi yeniden dene.", "Widget preference is not saved. Your choice is kept for this session. Retry saving.")}
      onRetry={() => { void retryStorage(storageError); }} /> : null}
    </>
  );
}
