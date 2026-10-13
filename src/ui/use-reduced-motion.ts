import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** Native navigation needs a React value and must follow changes while the app is open. */
export function useReducedMotionPreference() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active && !changed) setReduced(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      changed = true;
      setReduced(value);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
