import { useSyncExternalStore, useEffect } from "react";
import { toast, ToastViewport } from "panelui-native/components/toast";
import CircleCheck from "lucide-react-native/icons/circle-check";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import Info from "lucide-react-native/icons/info";
import { colors, semanticColors, type SemanticTone } from "./tokens";

export type ToastTone = SemanticTone | "neutral";
const toastVariants = { neutral: "default", info: "info", success: "success", warning: "warning", danger: "destructive" } as const;
const toastIcons = { neutral: Info, info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert };

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

/** Transient confirmation or notice: bottom, tone icon, 2.5s by default. */
export function showToast({ tone = "success", message, duration = 2500 }: { tone?: ToastTone; message: string; duration?: number }) {
  const Icon = toastIcons[tone];
  const color = tone === "neutral" ? colors.muted : semanticColors[tone].text;
  return toast.show({
    variant: toastVariants[tone],
    label: message,
    duration,
    closable: false,
    icon: <Icon size={16} strokeWidth={2} color={color} />,
  });
}

export function useSuccessToast() {
  return (message: string) => showToast({ tone: "success", message });
}
