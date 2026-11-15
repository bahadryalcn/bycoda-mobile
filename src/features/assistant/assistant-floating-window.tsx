import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardState } from "react-native-keyboard-controller";
import GripHorizontal from "lucide-react-native/icons/grip-horizontal";
import Maximize2 from "lucide-react-native/icons/maximize-2";
import PictureInPicture2 from "lucide-react-native/icons/picture-in-picture-2";
import Mic from "lucide-react-native/icons/mic";
import MicOff from "lucide-react-native/icons/mic-off";
import X from "lucide-react-native/icons/x";
import { Body, IconButton } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { metrics, radii, space } from "@/ui/tokens";
import { useReducedMotionPreference } from "@/ui/use-reduced-motion";
import { assistantWindowBounds, normalizeAssistantWindow, readAssistantWindowPosition, restoreAssistantWindow, type AssistantWindowPoint } from "./assistant-window-geometry";

const POSITION_KEY = "bycoda.assistantWindow.position.v1";
const mark = require("../../../../public/brand/bycoda/mark-white.png");
export type AssistantFloatingWindowProps = {
  title: string; status: string; active: boolean; muted: boolean; caption?: string;
  onExpand(): void; onClose(): void; onMute?(): void; onPip?(): void;
  /** Parent shell may supply its measured dock; default clears one navigation row. */
  bottomInset?: number;
};

/** A movable in-app window: its grip owns dragging, its independent controls own commands. */
export function AssistantFloatingWindow({ title, status, active, muted, caption, onExpand, onClose, onMute, onPip, bottomInset = 88 }: AssistantFloatingWindowProps) {
  const copy = useCopy(), { colors, uiStyles } = useMobileTheme();
  const viewport = useWindowDimensions(), insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardState(state => state.isVisible ? state.height : 0);
  const reduced = useReducedMotionPreference();
  const width = Math.min(320, Math.max(metrics.touchTarget, viewport.width - insets.left - insets.right - space.lg));
  const usableHeight = viewport.height - insets.top - Math.max(keyboardHeight, insets.bottom + bottomInset) - space.lg;
  const compact = usableHeight < 180;
  const [height, setHeight] = useState(160);
  const [position, setPosition] = useState<AssistantWindowPoint>({ x: 1, y: 1 });
  const interacted = useRef(false);
  const bounds = assistantWindowBounds({ ...viewport, ...insets, windowWidth: width, windowHeight: height, bottomInset, keyboardHeight });
  const x = useSharedValue(bounds.right), y = useSharedValue(bounds.bottom);
  const originX = useSharedValue(0), originY = useSharedValue(0);
  // A late storage read must not replace a position the owner already chose in this mount.
  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(POSITION_KEY).then(raw => { const saved = readAssistantWindowPosition(raw); if (mounted && !interacted.current && saved) setPosition(saved); }).catch(() => {});
    return () => { mounted = false; };
  }, []);
  // Relative coordinates survive rotation, keyboard changes and larger measured text without escaping the viewport.
  useEffect(() => {
    const point = restoreAssistantWindow(position, bounds);
    x.value = reduced ? point.x : withTiming(point.x, { duration: 140 });
    y.value = reduced ? point.y : withTiming(point.y, { duration: 140 });
  }, [position.x, position.y, bounds.left, bounds.right, bounds.top, bounds.bottom, reduced, x, y]);
  const commit = useCallback((left: number, top: number) => {
    interacted.current = true;
    const normalized = normalizeAssistantWindow({ x: left, y: top }, bounds);
    setPosition(normalized);
    void AsyncStorage.setItem(POSITION_KEY, JSON.stringify(normalized)).catch(() => {});
  }, [bounds.left, bounds.right, bounds.top, bounds.bottom]);
  const beginInteraction = useCallback(() => { interacted.current = true; }, []);
  const pan = Gesture.Pan().minDistance(6)
    .onBegin(() => { scheduleOnRN(beginInteraction); })
    .onStart(() => { originX.value = x.value; originY.value = y.value; })
    .onUpdate(event => { x.value = Math.max(bounds.left, Math.min(bounds.right, originX.value + event.translationX)); y.value = Math.max(bounds.top, Math.min(bounds.bottom, originY.value + event.translationY)); })
    .onFinalize(() => { scheduleOnRN(commit, x.value, y.value); });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));
  const move = (direction: string) => {
    const step = metrics.touchTarget;
    commit(x.value + (direction === "moveRight" ? step : direction === "moveLeft" ? -step : 0), y.value + (direction === "moveDown" ? step : direction === "moveUp" ? -step : 0));
  };
  const controls = <View style={{ flexDirection: "row", justifyContent: "space-evenly", flexShrink: 0 }}>
    <View style={{ width: metrics.touchTarget, minHeight: metrics.touchTarget, alignItems: "center", justifyContent: "center" }}><IconButton label={copy("Asistana dön", "Return to assistant")} onPress={onExpand}><Maximize2 size={20} color={colors.text} /></IconButton></View>
    {onMute ? <View style={{ width: metrics.touchTarget, minHeight: metrics.touchTarget, alignItems: "center", justifyContent: "center" }}><IconButton label={muted ? copy("Mikrofonu aç", "Unmute microphone") : copy("Mikrofonu kapat", "Mute microphone")} onPress={onMute}>{muted ? <MicOff size={20} color={colors.warning} /> : <Mic size={20} color={active ? colors.accent : colors.muted} />}</IconButton></View> : null}
    {onPip ? <View style={{ width: metrics.touchTarget, minHeight: metrics.touchTarget, alignItems: "center", justifyContent: "center" }}><IconButton label={copy("Resim içinde resim", "Picture in picture")} onPress={onPip}><PictureInPicture2 size={20} color={colors.muted} /></IconButton></View> : null}
    <View style={{ width: metrics.touchTarget, minHeight: metrics.touchTarget, alignItems: "center", justifyContent: "center" }}><IconButton label={copy("Asistanı kapat", "Close assistant")} onPress={onClose}><X size={20} color={colors.muted} /></IconButton></View>
  </View>;
  return <Animated.View onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)} style={[{ position: "absolute", top: 0, left: 0, width, backgroundColor: colors.raised, borderRadius: radii.bubble, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator, padding: space.xs }, style]}>
    <View style={{ flexDirection: compact ? "row" : "column", alignItems: compact ? "center" : "stretch" }}>
      <GestureDetector gesture={pan}>
        <View accessible accessibilityRole="adjustable" accessibilityLabel={copy("Asistan penceresini taşı", "Move assistant window")} accessibilityValue={{ text: `${title}. ${status}` }}
          accessibilityActions={[{ name: "moveLeft", label: copy("Sola taşı", "Move left") }, { name: "moveRight", label: copy("Sağa taşı", "Move right") }, { name: "moveUp", label: copy("Yukarı taşı", "Move up") }, { name: "moveDown", label: copy("Aşağı taşı", "Move down") }]}
          onAccessibilityAction={({ nativeEvent }) => move(nativeEvent.actionName)}
          style={{ minHeight: metrics.touchTarget, minWidth: metrics.touchTarget, flexShrink: 1, flexGrow: compact ? 1 : 0, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm }}>
          <Image source={mark} tintColor={colors.brand} contentFit="contain" accessible={false} style={{ width: 22, height: 22 }} />
          {!compact ? <View style={{ flex: 1, minWidth: 0 }}><Body numberOfLines={1} style={uiStyles.buttonLabel}>{title}</Body><View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}><View style={{ width: 6, height: 6, borderRadius: radii.pill, backgroundColor: active ? colors.accent : colors.muted }} /><Body muted numberOfLines={1} style={uiStyles.caption}>{status}</Body></View></View> : null}
          {!compact ? <GripHorizontal size={16} color={colors.muted} /> : null}
        </View>
      </GestureDetector>
      {!compact && caption ? <View style={{ paddingHorizontal: space.sm, paddingBottom: space.xs }}><Body numberOfLines={2} style={uiStyles.caption}>{caption}</Body></View> : null}
      {controls}
    </View>
  </Animated.View>;
}
