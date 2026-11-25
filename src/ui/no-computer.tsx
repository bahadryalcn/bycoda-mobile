import { View } from "react-native";
import { router } from "expo-router";
import { useMachines } from "../state/machines";
import { useCopy } from "./copy";
import { StateView } from "./state-view";
// Through the barrel so screens and their tests share one owner for these states.
import { QueryState, Skeleton } from "./primitives";

/** Shared [tr, en] copy for "no computer is connected"; informal register everywhere. */
export const NO_COMPUTER_TITLE: readonly [string, string] = ["Önce bir bilgisayar bağla", "Connect a computer first"];
export const NO_COMPUTER_ACTION: readonly [string, string] = ["Bilgisayar bağla", "Connect a computer"];

/**
 * The one "no computer" state: same title, same action and the same destination (Computers, where
 * pairing starts) on every screen that needs a computer. `description` says what the screen would
 * show, one short informal sentence.
 */
export function NoComputerState({ description }: { description?: string }) {
  const copy = useCopy();
  return (
    <StateView
      illustration="connect-computer"
      title={copy(...NO_COMPUTER_TITLE)}
      description={description}
      action={{ label: copy(...NO_COMPUTER_ACTION), onPress: () => router.push("/machines") }}
    />
  );
}

/**
 * `NoComputerState` for a screen whose body is only that state, gated on the saved computers: a
 * skeleton while they load and the retryable read error when storage fails, so a screen never
 * shows "connect a computer" before it knows.
 */
export function NoComputerGate({ description }: { description?: string }) {
  const ready = useMachines((state) => state.hydrated && !state.connectionPending);
  const error = useMachines((state) => state.storageError);
  return (
    <View style={{ flex: 1 }}>
      {error ? (
        <QueryState query={{ error, refetch: () => useMachines.getState().hydrate() }} size="region" />
      ) : !ready ? (
        <Skeleton />
      ) : (
        <NoComputerState description={description} />
      )}
    </View>
  );
}
