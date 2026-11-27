import { useAsyncAction } from "@/state/actions";
import { useMachines, whenConnectionsSettled } from "@/state/machines";
import { assertAppAccess } from "@/state/security";
import { useCopy } from "@/ui/copy";
import { flushWorkspaceDrafts } from "../workspace/draft-guard";
import { ConnectionBusyError, ConnectionRecoveryError, selectSavedComputer } from "./recovery";

type Copy = ReturnType<typeof useCopy>;

/** Selection failures: reloading is only suggested when saved connections really failed to load. */
export function selectionError(error: unknown, copy: Copy): unknown {
  if (error instanceof ConnectionBusyError)
    return new Error(copy(
      "Başka bir bağlantı değişikliği sürüyor. Biraz sonra yeniden dene.",
      "Another connection change is still running. Try again in a moment.",
    ));
  if (!(error instanceof ConnectionRecoveryError)) return error;
  return new Error(useMachines.getState().storageError
    ? copy(
        "Bilgisayar seçilemedi. Kaydedilmiş bağlantıları yeniden yükleyip tekrar dene.",
        "Computer selection is unavailable. Reload saved connections and try again.",
      )
    : copy("Bilgisayar seçilemedi. Yeniden dene.", "The computer couldn’t be selected. Try again."));
}

/** Switches the active computer from any surface through the same guarded path as the Computers screen. */
export function useSwitchComputer() {
  const copy = useCopy();
  const operation = useAsyncAction<{ message?: string }>();
  const switchTo = (id: string, onDone: () => void, isCurrent?: () => boolean) =>
    operation.run(async () => {
      try {
        await selectSavedComputer(id, {
          flushDrafts: flushWorkspaceDrafts,
          assertAccess: () => {
            assertAppAccess();
            if (isCurrent && !isCurrent()) throw new ConnectionRecoveryError();
          },
          getState: () => useMachines.getState(),
          selectMachine: (next) => useMachines.getState().selectMachine(next),
          onSelected: onDone,
          settled: whenConnectionsSettled,
        });
      } catch (error) {
        throw selectionError(error, copy);
      }
      return { message: copy("Bilgisayar seçildi.", "Computer selected.") };
    });
  return { operation, busy: operation.isPending, switchTo };
}
