import { View } from "react-native";
import type { PropsWithChildren } from "react";
import { useMobileTheme } from "@/ui/theme";
import { useMachines } from "./state/machines";
import { Loading } from "./ui/primitives";
import { useCopy } from "./ui/copy";

/**
 * Holds the protected workspace until the saved computers are read. It sits inside the app lock, so
 * hydration (started by AppLifecycle) overlaps the security check and the account load instead of
 * delaying them, while nothing that reads machine state mounts before hydration finishes.
 */
export function MachinesReadyGate({ children }: PropsWithChildren) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const hydrated = useMachines((s) => s.hydrated);
  if (!hydrated)
    return (
      <View style={[uiStyles.screen, uiStyles.centered]}>
        <Loading label={copy("Yükleniyor…", "Loading…")} centered />
      </View>
    );
  return children;
}
