import { useEffect } from "react";
import * as ScreenOrientation from "expo-screen-orientation";

/** Lets a full-screen media view rotate while open and hands the app's default back on close. */
export function useRotatableScreen(active: boolean) {
  useEffect(() => {
    if (!active) return;
    ScreenOrientation.unlockAsync().catch(() => undefined);
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT).catch(() => undefined); };
  }, [active]);
}
