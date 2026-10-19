import { useMobileTheme } from "./theme";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { BackHandler, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSecurity } from "../state/security";
import { uiStyles } from "./styles";
import type { OverlayEntry, OverlayRegistry, ScreenOverlayProps } from "./overlay-types";
import { canRemoveOverlay, closeOverlay, showOverlay, type OverlayState } from "./overlay-state";
import { motionTiming } from "./motion";
import { motion } from "./tokens";
import { asWebElement, createOverlayWebFocus } from "./overlay-web-focus";

const Context = createContext<OverlayRegistry | null>(null);
const LayerPriority = createContext(0);
const LayerProgress = createContext<SharedValue<number> | null>(null);

/** UIKit sheet curve: fast departure, long gentle settle. */
const sheetEasing = Easing.bezier(0.32, 0.72, 0, 1);

export function useOverlayProgress() {
  return useContext(LayerProgress);
}

function OverlayLayer({
  id,
  entry,
  active,
  onHidden,
  onElement,
}: {
  id: string;
  entry: OverlayState<OverlayEntry>;
  active: boolean;
  onHidden(id: string, generation: number): void;
  onElement(id: string, value: unknown): void;
}) {
  useMobileTheme();
  const progress = useSharedValue(0);
  useEffect(() => {
    const generation = entry.generation;
    const visible = entry.visible;
    progress.value = withTiming(
      visible ? 1 : 0,
      visible
        ? { ...motionTiming, duration: motion.sheet + 100, easing: sheetEasing }
        : { ...motionTiming, duration: motion.sheet - 60 },
      (finished) => {
        if (finished && !visible) scheduleOnRN(onHidden, id, generation);
      },
    );
  }, [id, entry.visible, entry.generation, progress, onHidden]);
  const style = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <Animated.View
      ref={(element: unknown) => onElement(id, element)}
      style={[StyleSheet.absoluteFill, { flex: 1 }, style]}
      accessibilityViewIsModal={active}
      accessibilityElementsHidden={!active}
      aria-hidden={process.env.EXPO_OS === "web" ? undefined : !active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      pointerEvents={active && entry.visible ? "auto" : "none"}
    >
      <LayerPriority.Provider value={entry.value.priority}>
        <LayerProgress.Provider value={progress}>{entry.value.children}</LayerProgress.Provider>
      </LayerPriority.Provider>
    </Animated.View>
  );
}

/** Private overlays share the activity window and the application's lock boundary. */
export function OverlayProvider({ children }: PropsWithChildren) {
  useMobileTheme();
  const [entries, setEntries] = useState<Map<string, OverlayState<OverlayEntry>>>(() => new Map());
  const background = useRef<View>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  const webFocus = useRef<ReturnType<typeof createOverlayWebFocus> | null>(null);
  const captureElement = useCallback((id: string, value: unknown) => {
    if (process.env.EXPO_OS !== "web") return;
    const element = asWebElement(value);
    if (element) elements.current.set(id, element);
    else elements.current.delete(id);
  }, []);
  const unlocked = useSecurity((state) => state.status === "unlocked");
  const update = useCallback((id: string, entry: OverlayEntry) => {
    setEntries((current) => new Map(current).set(id, showOverlay(current.get(id), entry)));
  }, []);
  const remove = useCallback((id: string) => {
    setEntries((current) => {
      const entry = current.get(id);
      if (!entry?.visible) return current;
      return new Map(current).set(id, closeOverlay(entry));
    });
  }, []);
  const finishClose = useCallback((id: string, generation: number) => {
    setEntries((current) => {
      if (!canRemoveOverlay(current.get(id), generation)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, []);
  const registry = useMemo(() => ({ update, remove }), [update, remove]);
  const layers = unlocked
    ? [...entries.entries()].sort((a, b) => a[1].value.priority - b[1].value.priority)
    : [];
  const active = layers.at(-1)?.[1];
  useLayoutEffect(() => {
    if (process.env.EXPO_OS !== "web" || typeof document === "undefined") return;
    const controller = createOverlayWebFocus(document);
    webFocus.current = controller;
    return () => {
      controller.dispose();
      webFocus.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    webFocus.current?.sync({
      background: asWebElement(background.current),
      unlocked,
      layers: layers.flatMap(([id, entry]) => {
        const element = elements.current.get(id);
        return element ? [{ id, element, ...entry.value, visible: entry.visible }] : [];
      }),
    });
  });
  useEffect(() => {
    if (!active || process.env.EXPO_OS === "web") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (useSecurity.getState().status !== "unlocked") return true;
      if (active.visible) active.value.onClose();
      return true;
    });
    return () => subscription.remove();
  }, [active]);
  return (
    <Context.Provider value={registry}>
      <View style={uiStyles.screen}>
        <View
          ref={background}
          style={uiStyles.screen}
          pointerEvents={active ? "none" : "auto"}
          accessibilityElementsHidden={!!active}
          importantForAccessibility={active ? "no-hide-descendants" : "auto"}
        >
          {children}
        </View>
        {layers.map(([id, entry], index) => (
          <OverlayLayer
            key={id}
            id={id}
            entry={entry}
            active={index === layers.length - 1}
            onHidden={finishClose}
            onElement={captureElement}
          />
        ))}
      </View>
    </Context.Provider>
  );
}

export function ScreenOverlay({ visible, priority, label, onClose, children }: ScreenOverlayProps) {
  useMobileTheme();
  const registry = useContext(Context);
  const parentPriority = useContext(LayerPriority);
  const layerPriority = priority ?? Math.max(20, parentPriority + 1);
  const id = useId();
  if (!registry) throw new Error("ScreenOverlay requires OverlayProvider.");
  useLayoutEffect(() => {
    if (visible) registry.update(id, { children, onClose, label, priority: layerPriority });
    else registry.remove(id);
  }, [registry, id, visible, children, label, onClose, layerPriority]);
  useLayoutEffect(() => () => registry.remove(id), [registry, id]);
  return null;
}
