import { useAsyncAction } from "@/state/actions";
import { useMachines } from "@/state/machines";
import { assertAppAccess } from "@/state/security";
import { useCopy } from "@/ui/copy";
import { flushWorkspaceDrafts } from "../workspace/draft-guard";
import { ConnectionRecoveryError, selectSavedComputer } from "./recovery";

/** Switches the active computer from any surface through the same guarded path as the Computers screen. */
export function useSwitchComputer() {
  const copy = useCopy();
  const operation = useAsyncAction<{ message?: string }>();
  const switchTo = (id: string, onDone: () => void) =>
    operation.run(async () => {
      try {
        await selectSavedComputer(id, {
          flushDrafts: flushWorkspaceDrafts,
          assertAccess: assertAppAccess,
          getState: () => useMachines.getState(),
          selectMachine: (next) => useMachines.getState().selectMachine(next),
          onSelected: onDone,
        });
      } catch (error) {
        throw error instanceof ConnectionRecoveryError
          ? new Error(copy(
              "Bilgisayar seçilemedi. Kaydedilmiş bağlantıları yeniden yükleyip tekrar dene.",
              "Computer selection is unavailable. Reload saved connections and try again.",
            ))
          : error;
      }
      return { message: copy("Bilgisayar seçildi.", "Computer selected.") };
    });
  return { operation, busy: operation.isPending, switchTo };
}
