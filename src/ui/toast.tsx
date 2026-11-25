import { useSyncExternalStore, useEffect } from "react";
import { toast, ToastViewport } from "panelui-native/components/toast";
import { ToastCard, type ToastAction, type ToastTone } from "./toast-card";

export type { ToastAction, ToastTone } from "./toast-card";

let hosts = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const mounted = () => hosts > 0;

/** Mounts PanelUI's viewport and records that toasts can be seen, so callers can fall back to inline text. */
export function ToastHost() {
  useEffect(() => {
    hosts++;
    for (const listener of listeners) listener();
    return () => { hosts--; for (const listener of listeners) listener(); };
  }, []);
  return <ToastViewport />;
}

/** True while a ToastHost is mounted (false in tests, on the lock screen and before unlock). */
export function useToastAvailable() {
  return useSyncExternalStore(subscribe, mounted, () => false);
}

export type ShowToastOptions = { tone?: ToastTone; message: string; duration?: number; action?: ToastAction };

/** Default visible time; an action (Undo, Retry) needs longer to reach. */
export const TOAST_DURATION_MS = 4000;
export const TOAST_ACTION_DURATION_MS = 6000;

/**
 * Transient result of a quick action: bottom, tone icon, 4 s (6 s with an action). An action such
 * as Undo or Retry closes the toast before it runs. Never for an uncertain write: that stays inline.
 */
export function showToast({ tone = "success", message, duration, action }: ShowToastOptions) {
  return toast.show({
    label: message,
    duration: duration ?? (action ? TOAST_ACTION_DURATION_MS : TOAST_DURATION_MS),
    component: ({ hide }) => (
      <ToastCard
        tone={tone}
        message={message}
        action={action && { label: action.label, onPress: () => { hide(); action.onPress(); } }}
      />
    ),
  });
}

export function useSuccessToast() {
  return (message: string) => showToast({ tone: "success", message });
}
