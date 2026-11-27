import { useEffect } from "react";
import { useMachines } from "@/state/machines";
import { useCopy } from "@/ui/copy";
import { showToast } from "@/ui/toast";
import { usePersistentError } from "@/ui/use-persistent-error";

/**
 * Headless: a computer, project or language choice that could not be written to the phone stays applied
 * and connections keep running. The store retries quietly; only a failure that outlasts the shared grace
 * raises one warning toast with Retry, and a write that succeeds meanwhile reports nothing.
 */
export function PreferenceSaveToast() {
  const copy = useCopy();
  const error = usePersistentError(useMachines((state) => state.preferenceError));
  const retry = useMachines((state) => state.retryPreferences);
  // Reason: the toast is raised once per reported failure object, not on every render.
  useEffect(() => {
    if (!error) return;
    showToast({
      tone: "warning",
      message: copy("Seçimin bu telefona kaydedilemedi.", "Your choice couldn’t be saved on this phone."),
      action: { label: copy("Yeniden dene", "Retry"), onPress: () => { void retry().catch(() => undefined); } },
    });
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps -- one toast per reported failure
  return null;
}
