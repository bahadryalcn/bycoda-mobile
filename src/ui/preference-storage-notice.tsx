import { useState } from "react";
import { useSingleFlight } from "@/state/actions";
import type { PreferenceStorageError } from "@/state/preference-store";
import { useCopy } from "@/ui/copy";
import { Notice } from "@/ui/primitives";

/**
 * Read or save failure for a phone-local preference. The choice stays on screen; retry repeats the failed
 * read or write, so the notice never says a change was saved when it was not.
 */
export function PreferenceStorageNotice({ error, retry }: { error: PreferenceStorageError | null; retry: () => Promise<void> }) {
  const copy = useCopy();
  const flight = useSingleFlight<void>();
  const [retrying, setRetrying] = useState(false);
  if (!error) return null;
  return (
    <Notice
      tone="warning"
      message={error.operation === "read"
        ? copy("Kayıtlı tercihler okunamadı. Seçimlerin ekranda kalır.", "Saved preferences couldn’t load. Your choices stay on screen.")
        : copy("Seçimin bu telefona kaydedilemedi.", "Your choice couldn’t be saved on this phone.")}
      retrying={retrying}
      onRetry={() => {
        if (flight.isPending()) return;
        setRetrying(true);
        void flight.run(retry).then(
          () => setRetrying(false),
          () => setRetrying(false),
        );
      }}
    />
  );
}
