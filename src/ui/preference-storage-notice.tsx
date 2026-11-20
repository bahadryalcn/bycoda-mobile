import { useState } from "react";
import type { PreferenceStorageError } from "@/state/preference-store";
import { useCopy } from "@/ui/copy";
import { Notice } from "@/ui/primitives";

/**
 * Read or save failure for a phone-local preference. The choice stays on screen; retry repeats the failed
 * read or write, so the notice never says a change was saved when it was not.
 */
export function PreferenceStorageNotice({ error, retry }: { error: PreferenceStorageError | null; retry: () => Promise<void> }) {
  const copy = useCopy();
  const [retrying, setRetrying] = useState(false);
  if (!error) return null;
  return (
    <Notice
      tone="warning"
      message={error.operation === "read"
        ? copy("Kaydedilmiş tercihler okunamadı. Seçimlerin korunur; yeniden dene.", "Saved preferences could not be read. Your choices are kept; retry.")
        : copy("Tercih değişti, ancak bu telefona kaydedilemedi. Bu seçimi kaydetmek için yeniden dene.", "The preference changed but could not be saved on this phone. Retry to keep this choice.")}
      retrying={retrying}
      onRetry={() => {
        if (retrying) return;
        setRetrying(true);
        void retry().finally(() => setRetrying(false));
      }}
    />
  );
}
