import { useEffect, useRef, type RefObject } from "react";
import { AccessibilityInfo, findNodeHandle, type TextInput, type View, type HostInstance, type TextInputInstance } from "react-native";
import { useSecurity } from "@/state/security";
import { usePrivateContentAccess } from "./private-content";

/** Native screen-reader focus for the existing Sheet heading and trigger. */
export function useNativeSheetFocus(
  visible: boolean,
  heading: RefObject<HostInstance | null>,
  returnFocusRef?: RefObject<HostInstance | TextInputInstance | null>,
) {
  const access = usePrivateContentAccess();
  const epoch = useRef(0);
  useEffect(() => {
    if (!visible || process.env.EXPO_OS === "web") return;
    const generation = ++epoch.current;
    let active = true;
    let readerEnabled = false;
    const mayFocus = () => epoch.current === generation && access.check()
      && useSecurity.getState().status === "unlocked";
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (!enabled || !active) return;
      readerEnabled = true;
      requestAnimationFrame(() => {
        if (!active || !mayFocus()) return;
        const tag = findNodeHandle(heading.current);
        if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
      });
    }).catch(() => { /* An unavailable accessibility service must not move focus. */ });
    return () => {
      active = false;
      if (!readerEnabled) return;
      requestAnimationFrame(() => {
        if (!mayFocus()) return;
        const tag = returnFocusRef?.current && findNodeHandle(returnFocusRef.current);
        if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
      });
    };
  }, [visible, heading, returnFocusRef, access]);
}
