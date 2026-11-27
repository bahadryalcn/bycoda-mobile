import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardState } from "react-native-keyboard-controller";
import Maximize2 from "lucide-react-native/icons/maximize-2";
import PictureInPicture2 from "lucide-react-native/icons/picture-in-picture-2";
import Mic from "lucide-react-native/icons/mic";
import MicOff from "lucide-react-native/icons/mic-off";
import PhoneOff from "lucide-react-native/icons/phone-off";
import X from "lucide-react-native/icons/x";
import { Body, IconButton, PressableCard } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { metrics, radii, space } from "@/ui/tokens";
import { useReducedMotionPreference } from "@/ui/use-reduced-motion";
import { assistantWindowBounds, normalizeAssistantWindow, readAssistantWindowPosition, restoreAssistantWindow, type AssistantWindowPoint } from "./assistant-window-geometry";
import { AssistantVoiceOrb } from "./assistant-voice-stage";
import { assistantWindowReserve, useAssistantWindowReserve } from "./assistant-window-reserve";
import type { AssistantOrbState } from "./assistant-voice-presentation";

const POSITION_KEY = "bycoda.assistantWindow.position.v1";
export type AssistantFloatingWindowProps = {
  title: string; status: string; active: boolean; muted: boolean;
  orbState?: AssistantOrbState; level?: number;
  onExpand(): void; onClose(): void; onMute?(): void; onPip?(): void;
  /** Parent shell may supply its measured dock; default clears one navigation row. */
  bottomInset?: number;
};

/** A movable in-app window: its grip owns dragging, its independent controls own commands. */
export function AssistantFloatingWindow({ title, status, active, muted, orbState, level, onExpand, onClose, onMute, onPip, bottomInset = 88 }: AssistantFloatingWindowProps) {
  const copy = useCopy(), { colors, uiStyles } = useMobileTheme();
  const viewport = useWindowDimensions(), insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardState(state => state.isVisible ? state.height : 0);
  const reduced = useReducedMotionPreference();
  const width = Math.min(320, Math.max(metrics.touchTarget, viewport.width - insets.left - insets.right - space.lg));
  const [height, setHeight] = useState(metrics.touchTarget + space.sm * 2);
  const [position, setPosition] = useState<AssistantWindowPoint>({ x: 1, y: 1 });
  const interacted = useRef(false);
  const bounds = assistantWindowBounds({ ...viewport, ...insets, windowWidth: width, windowHeight: height, bottomInset, keyboardHeight });
  // Reason: screens size their bottom inset from this; publish while mounted and withdraw on unmount.
  useEffect(() => {
    useAssistantWindowReserve.setState({ reserve: assistantWindowReserve(true, position.y, height, space.sm) });
    return () => useAssistantWindowReserve.setState({ reserve: 0 });
  }, [position.y, height]);
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
  const handleGesture = Gesture.Exclusive(pan, Gesture.Tap().maxDistance(6).onEnd((_event, success) => { if (success) scheduleOnRN(onExpand); }));
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }] }));
  const move = (direction: string) => {
    const step = metrics.touchTarget;
    commit(x.value + (direction === "moveRight" ? step : direction === "moveLeft" ? -step : 0), y.value + (direction === "moveDown" ? step : direction === "moveUp" ? -step : 0));
  };
  const controls = <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", flexShrink: 1, marginLeft: "auto" }}>
    <View style={{ width: metrics.touchTarget, minHeight: metrics.touchTarget, alignItems: "center", justifyContent: "center" }}><IconButton label={copy("Asistana dön", "Return to assistant")} onPress={onExpand}><Maximize2 size={20} color={colors.text} /></IconButton></View>
    {onMute ? <View style={{ width: metrics.touchTarget, minHeight: metrics.touchTarget, alignItems: "center", justifyContent: "center" }}><IconButton label={muted ? copy("Mikrofonu aç", "Unmute microphone") : copy("Mikrofonu kapat", "Mute microphone")} onPress={onMute}>{muted ? <MicOff size={20} color={colors.warning} /> : <Mic size={20} color={active ? colors.accent : colors.muted} />}</IconButton></View> : null}
    {onPip ? <View style={{ width: metrics.touchTarget, minHeight: metrics.touchTarget, alignItems: "center", justifyContent: "center" }}><IconButton label={copy("Resim içinde resim", "Picture in picture")} onPress={onPip}><PictureInPicture2 size={20} color={colors.text} /></IconButton></View> : null}
    <View style={{ width: metrics.touchTarget, minHeight: metrics.touchTarget, alignItems: "center", justifyContent: "center" }}><IconButton label={onMute ? copy("Görüşmeyi bitir", "End voice call") : copy("Asistanı kapat", "Close assistant")} tone={onMute ? "danger" : undefined} onPress={onClose}>{onMute ? <PhoneOff size={20} color={colors.danger} /> : <X size={20} color={colors.muted} />}</IconButton></View>
  </View>;
  return <Animated.View onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)} style={[{ position: "absolute", top: 0, left: 0, width, backgroundColor: colors.raised, borderRadius: radii.bubble, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator, padding: space.xs }, style]}>
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
      <GestureDetector gesture={handleGesture}>
        <View accessible accessibilityRole="adjustable" accessibilityLabel={copy("Asistan penceresini taşı", "Move assistant window")} accessibilityValue={{ text: `${title}. ${status}` }}
          accessibilityActions={[{ name: "moveLeft", label: copy("Sola taşı", "Move left") }, { name: "moveRight", label: copy("Sağa taşı", "Move right") }, { name: "moveUp", label: copy("Yukarı taşı", "Move up") }, { name: "moveDown", label: copy("Aşağı taşı", "Move down") }]}
          onAccessibilityAction={({ nativeEvent }) => move(nativeEvent.actionName)}
          style={{ minHeight: metrics.touchTarget, width: metrics.touchTarget, justifyContent: "center", alignItems: "center" }}>
          <AssistantVoiceOrb size={metrics.touchTarget} state={orbState ?? (muted ? "muted" : active ? "listening" : "idle")} level={level ?? 0} />
        </View>
      </GestureDetector>
      <View style={{ flex: 1, minWidth: metrics.touchTarget }}>
        <PressableCard label={`${title}. ${status}`} onPress={onExpand} style={{ minHeight: metrics.touchTarget, justifyContent: "center", padding: space.xs }}>
          <Body muted style={uiStyles.caption}>{status}</Body>
        </PressableCard>
      </View>
      {controls}
    </View>
  </Animated.View>;
}
