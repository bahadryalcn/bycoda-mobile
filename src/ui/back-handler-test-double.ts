import { useEffect, useRef } from "react";
import { BackHandler } from "react-native";

/**
 * Test double for `panelui-native/hooks/use-back-handler`. Vitest loads the
 * upstream hook outside the module graph, where a test's `react-native` mock
 * cannot reach it. This copy keeps the upstream contract (gated on `enabled`,
 * always consumes the press) without its Android-only platform gate. It is wired
 * in through the `vitest.config.ts` alias.
 */
export function useBackHandler(enabled: boolean, onBack: () => void): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  useEffect(() => {
    if (!enabled) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onBackRef.current();
      return true;
    });
    return () => subscription.remove();
  }, [enabled]);
}
