import { RouteFocusContext, useRouteFocus } from "./use-route-focus";
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
  useSyncExternalStore,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { StyleSheet, View, type HostInstance } from "react-native";
import { useBackHandler } from "panelui-native/hooks/use-back-handler";
import { KeyboardController } from "react-native-keyboard-controller";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSecurity } from "../state/security";
import type { OverlayEntry, OverlayRegistry, ScreenOverlayProps } from "./overlay-types";
import { canRemoveOverlay, closeOverlay, showOverlay, type OverlayState } from "./overlay-state";
import { createOverlayContentStore, type OverlayContentStore } from "./overlay-content-store";
import { motionTiming } from "./motion";
import { motion } from "./tokens";
import { asWebElement, createOverlayWebFocus } from "./overlay-web-focus";
import { OverlayWebMenuContext } from "./overlay-web-menu-context";
import { PrivateContentAccessProvider, usePrivateContentAccess } from "./private-content";

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
  topmost,
  contents,
  onHidden,
  onElement,
}: {
  id: string;
  entry: OverlayState<OverlayEntry>;
  active: boolean;
  topmost: boolean;
  contents: OverlayContentStore;
  onHidden(id: string, generation: number): void;
  onElement(id: string, value: unknown): void;
}) {
  useMobileTheme();
  // Only this layer re-renders when its content changes; the provider's layer list is untouched.
  const children = useSyncExternalStore(
    useCallback((listener: () => void) => contents.subscribe(id, listener), [contents, id]),
    () => contents.get(id),
  );
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
  const permitted = entry.value.routeFocused !== false && (entry.value.privateAccess?.check() ?? true);
  return (
    <Animated.View
      ref={(element: unknown) => onElement(id, element)}
      style={[StyleSheet.absoluteFill, { flex: 1 }, style, !permitted ? { display: "none" } : undefined]}
      accessibilityViewIsModal={active && permitted}
      accessibilityElementsHidden={!active || !permitted}
      aria-hidden={!active || !permitted}
      importantForAccessibility={active && permitted ? "auto" : "no-hide-descendants"}
      pointerEvents={topmost && permitted && entry.visible ? "auto" : "none"}
    >
      <RouteFocusContext.Provider value={entry.value.routeFocused !== false}>
      <LayerPriority.Provider value={entry.value.priority}>
        <LayerProgress.Provider value={progress}>{entry.value.privateAccess ? <PrivateContentAccessProvider value={entry.value.privateAccess}>{children}</PrivateContentAccessProvider> : children}</LayerProgress.Provider>
      </LayerPriority.Provider>
      </RouteFocusContext.Provider>
    </Animated.View>
  );
}

/** Private overlays share the activity window and the application's lock boundary. */
export function OverlayProvider({ children }: PropsWithChildren) {
  const { uiStyles } = useMobileTheme();
  const [entries, setEntries] = useState<Map<string, OverlayState<OverlayEntry>>>(() => new Map());
  const [contents] = useState(createOverlayContentStore);
  const background = useRef<HostInstance>(null);
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
  const drop = useCallback((id: string) => {
    contents.delete(id);
    setEntries((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }, [contents]);
  // Content is written only while visible, so a hidden owner never replaces what a closing sheet is showing.
  const setContent = useCallback((id: string, children: ReactNode) => contents.set(id, children), [contents]);
  const finishClose = useCallback((id: string, generation: number) => {
    setEntries((current) => {
      if (!canRemoveOverlay(current.get(id), generation)) return current;
      const next = new Map(current);
      next.delete(id);
      contents.delete(id);
      return next;
    });
  }, [contents]);
  const registry = useMemo(() => ({ update, remove, drop, setContent }), [update, remove, drop, setContent]);
  const menuFocus = useMemo(() => ({ register: (menu: import("./overlay-web-focus").WebMenuLayer) =>
    webFocus.current?.registerMenu(menu) ?? (() => {}) }), []);
  const layers = unlocked
    ? [...entries.entries()].sort((a, b) => a[1].value.priority - b[1].value.priority)
    : [];
  const accessibleLayers = layers.filter(([, entry]) => entry.value.routeFocused !== false && (entry.value.privateAccess?.check() ?? true));
  const topmost = accessibleLayers.at(-1)?.[1];
  // The closing layer still blocks pointer input during its fade. The visible layer owns Back and accessibility.
  const backOwner = accessibleLayers.filter(([, entry]) => entry.visible).at(-1)?.[1];
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
      layers: accessibleLayers.flatMap(([id, entry]) => {
        const element = elements.current.get(id);
        return element ? [{ id, element, ...entry.value, visible: entry.visible }] : [];
      }),
    });
  });
  useBackHandler(!!backOwner, () => {
    if (useSecurity.getState().status !== "unlocked") return;
    if (backOwner && KeyboardController.isVisible()) {
      void KeyboardController.dismiss();
      return;
    }
    backOwner?.value.onClose();
  });
  return (
    <Context.Provider value={registry}><OverlayWebMenuContext.Provider value={menuFocus}>
      <View style={uiStyles.screen}>
        <View
          ref={background}
          // Keep native screen stacks parented while modal accessibility and touch blocking change.
          collapsable={false}
          style={uiStyles.screen}
          pointerEvents={topmost ? "none" : "auto"}
          accessibilityElementsHidden={!!backOwner}
          importantForAccessibility={backOwner ? "no-hide-descendants" : "auto"}
        >
          {children}
        </View>
        {layers.map(([id, entry]) => (
          <OverlayLayer
            key={id}
            id={id}
            entry={entry}
            active={entry === backOwner}
            topmost={entry === topmost}
            contents={contents}
            onHidden={finishClose}
            onElement={captureElement}
          />
        ))}
      </View>
    </OverlayWebMenuContext.Provider></Context.Provider>
  );
}

export function ScreenOverlay({ visible, priority, label, onClose, children }: ScreenOverlayProps) {
  useMobileTheme();
  const registry = useContext(Context);
  const parentPriority = useContext(LayerPriority);
  const privateAccess = usePrivateContentAccess();
  const routeFocused = useRouteFocus();
  const layerPriority = priority ?? Math.max(20, parentPriority + 1);
  const id = useId();
  const unlocked = useSecurity((state) => state.status === "unlocked");
  if (!registry) throw new Error("ScreenOverlay requires OverlayProvider.");
  // Inline close handlers change on every owner render; the layer keeps one stable callback that reaches the latest one.
  const closeRef = useRef(onClose);
  // Runs after every commit, so the stable callback always targets the most recent owner render.
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  const close = useCallback(() => closeRef.current(), []);
  // Content is published only while visible: a sheet sliding out keeps what it showed, not the owner's fallback.
  useLayoutEffect(() => {
    if (unlocked && visible) registry.setContent(id, children);
  }, [registry, id, unlocked, visible, children]);
  useLayoutEffect(() => {
    // A lock drops the layer outright, so protected content is never kept across it.
    // Only an unlocked close keeps the last title and content, and only until its fade ends.
    if (!unlocked) registry.drop(id);
    else if (visible) registry.update(id, { onClose: close, label, priority: layerPriority, privateAccess, routeFocused });
    else registry.remove(id);
  }, [registry, id, unlocked, visible, close, label, layerPriority, privateAccess, routeFocused]);
  useLayoutEffect(() => () => registry.remove(id), [registry, id]);
  return null;
}
