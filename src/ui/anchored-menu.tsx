import { isValidElement, cloneElement, useEffect, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { AccessibilityInfo, Keyboard, Pressable, ScrollView, StyleSheet, View, findNodeHandle, useWindowDimensions, type HostInstance } from "react-native";
import Animated, { Easing, Keyframe, ReduceMotion } from "react-native-reanimated";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Portal } from "panelui-native/primitives/portal";
import { useBackHandler } from "panelui-native/hooks/use-back-handler";
import CheckGlyph from "lucide-react-native/icons/check";
import { useMobileTheme } from "./theme";
import { Body } from "./typography";
import { fontSize, iconSize, lineHeight, metrics, opacity, radii, space } from "./tokens";
import { usePrivateContentAccess, type PrivateContentAccess } from "./private-access";
import { stillMotion } from "./motion";
import { anchoredMenuAnchorMoved, anchoredMenuChoiceAllowed, anchoredMenuPlacement, type WindowFrame } from "./anchored-menu-model";
import { useCopy } from "./copy";

export type AnchoredMenuItem = {
  key: string;
  label: string;
  /** One quiet line under the label: what the choice does. */
  detail?: string;
  icon?: ReactNode;
  /** The current default; shows a check mark. */
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

/** Popover entrance: from the trigger's corner, a short scale and fade (never from nothing). */
const entrance = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.96 }, { translateY: 4 }] },
  100: { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }], easing: Easing.bezier(0.23, 1, 0.32, 1) },
}).duration(160).reduceMotion(ReduceMotion.System);

/**
 * A small choice anchored to its trigger (long-press on the composer's Send, for example). It is an
 * in-window layer in the app's PortalHost, not a React Native `Modal`, so the software keyboard and
 * the focused field stay as they are on Android and iOS. It opens upward above the trigger, clamped
 * to the screen edges, the safe area and the keyboard. A tap outside closes it without blurring the
 * field; back, the screen-reader escape gesture, the keyboard hiding or a window resize close it
 * too. A keyboard height change (Android reports the emoji panel or suggestion strip as another
 * "keyboard shown") re-measures the trigger and moves the menu with it instead of closing it.
 * Choosing a row closes the menu first, then runs it.
 *
 * Screen readers: iOS keeps VoiceOver inside the menu (`accessibilityViewIsModal`). Android has no
 * equivalent for an in-window layer, so the full-window scrim behind the menu is a labelled
 * "Close menu" button: touch exploration outside the menu finds it instead of the content behind.
 */
export function AnchoredMenu({ open, anchor, label, items, onClose, width = 272 }: {
  open: boolean;
  /** The trigger; measured in window coordinates when the menu opens. */
  anchor: RefObject<HostInstance | null>;
  /** Spoken name of the menu. */
  label: string;
  items: readonly AnchoredMenuItem[];
  onClose: () => void;
  width?: number;
}) {
  // Read here, in the trigger's tree: inside the PortalHost the screen's private boundary is not an ancestor.
  const access = usePrivateContentAccess();
  if (!open || items.length === 0) return null;
  return <Portal><AnchoredMenuLayer anchor={anchor} label={label} items={items} onClose={onClose} width={width} access={access} /></Portal>;
}

function AnchoredMenuLayer({ anchor, label, items, onClose, width, access }: {
  anchor: RefObject<HostInstance | null>; label: string; items: readonly AnchoredMenuItem[]; onClose: () => void; width: number;
  access: PrivateContentAccess;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const keyboardHeight = useKeyboardState((state) => state.height);
  const overlayRef = useRef<HostInstance>(null);
  const firstItem = useRef<HostInstance>(null);
  const [frames, setFrames] = useState<{ anchor?: WindowFrame; overlay?: WindowFrame }>({});
  const latestClose = useRef(onClose); latestClose.current = onClose;

  // The trigger's position is measured at opening and again after a keyboard frame change; the
  // menu follows it only when it really moved.
  useEffect(() => {
    const measure = () => anchor.current?.measureInWindow((x, y, w, h) => {
      const next = { x, y, width: w, height: h };
      setFrames((current) => (anchoredMenuAnchorMoved(current.anchor, next) ? { ...current, anchor: next } : current));
    });
    measure();
    const close = () => latestClose.current();
    const subscriptions = [Keyboard.addListener("keyboardDidShow", measure), Keyboard.addListener("keyboardDidHide", close)];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [anchor]);
  const size = useRef({ width: window.width, height: window.height });
  useEffect(() => {
    if (size.current.width !== window.width || size.current.height !== window.height) latestClose.current();
  }, [window.width, window.height]);
  useBackHandler(true, onClose);

  const placement = frames.anchor && frames.overlay && frames.anchor.width > 0
    ? anchoredMenuPlacement({
        anchor: frames.anchor,
        overlay: frames.overlay,
        desiredWidth: width,
        insets,
        keyboardInset: keyboardVisible ? keyboardHeight : 0,
        minHeight: metrics.touchTarget * 2,
      })
    : null;
  // Screen readers land on the first choice, not wherever focus was behind the layer.
  const placed = !!placement;
  useEffect(() => {
    if (!placed) return;
    const node = findNodeHandle(firstItem.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [placed]);

  const choose = (item: AnchoredMenuItem) => {
    if (item.disabled) return;
    onClose();
    // A choice whose private content was withdrawn while the menu was open runs nothing.
    if (!anchoredMenuChoiceAllowed(item, access)) return;
    item.onPress();
  };
  return (
    <View ref={overlayRef} collapsable={false} pointerEvents="box-none" style={StyleSheet.absoluteFill}
      onLayout={() => overlayRef.current?.measureInWindow((x, y, w, h) =>
        setFrames((current) => ({ ...current, overlay: { x, y, width: w, height: h } })))}>
      {/* Outside tap: closes only. It is not a scroller or a field, so the composer keeps focus.
          For TalkBack it is the labelled way out, covering the content behind the menu. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy("Menüyü kapat", "Close menu")}
        style={StyleSheet.absoluteFill}
        onPress={onClose}
      />
      {placement ? (
        <Animated.View
          entering={stillMotion ? undefined : entrance}
          accessibilityRole="menu"
          accessibilityLabel={label}
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={{
            position: "absolute",
            left: placement.left,
            width: placement.width,
            ...(placement.bottom !== undefined ? { bottom: placement.bottom } : { top: placement.top }),
            maxHeight: placement.maxHeight,
            transformOrigin: placement.origin,
            backgroundColor: colors.elevated,
            borderRadius: radii.card,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            shadowColor: colors.scrim,
            shadowOffset: { width: 0, height: space.xs },
            shadowOpacity: 0.18,
            shadowRadius: space.md,
            elevation: 6,
          }}
        >
          <ScrollView bounces={false} keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: space.xs }}>
            {items.map((item, index) => (
              <AnchoredMenuRow key={item.key} item={item} innerRef={index === 0 ? firstItem : undefined} onPress={() => choose(item)} />
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}
    </View>
  );
}

function AnchoredMenuRow({ item, innerRef, onPress }: { item: AnchoredMenuItem; innerRef?: RefObject<HostInstance | null>; onPress: () => void }) {
  const { colors } = useMobileTheme();
  return (
    <Pressable
      ref={innerRef}
      accessibilityRole="menuitem"
      accessibilityLabel={item.detail ? `${item.label}. ${item.detail}` : item.label}
      accessibilityState={{ selected: !!item.selected, disabled: !!item.disabled }}
      disabled={item.disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: metrics.touchTarget,
        flexDirection: "row",
        alignItems: "center",
        gap: space.row,
        paddingVertical: space.sm,
        paddingHorizontal: space.row,
        borderRadius: radii.control,
        backgroundColor: pressed ? colors.raised : "transparent",
        opacity: item.disabled ? opacity.disabled : 1,
      })}
    >
      {isValidElement(item.icon) ? (
        <View accessible={false} style={{ width: iconSize.row, alignItems: "center" }}>
          {cloneElement(item.icon as ReactElement<{ size?: number; strokeWidth?: number; color?: string }>, {
            size: iconSize.row, strokeWidth: 1.9, color: colors.muted,
          })}
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
        <Body selectable={false} style={{ fontSize: fontSize.control, lineHeight: lineHeight.control, fontWeight: "500" }}>{item.label}</Body>
        {item.detail ? (
          <Body muted selectable={false} style={{ fontSize: fontSize.caption, lineHeight: lineHeight.caption }}>{item.detail}</Body>
        ) : null}
      </View>
      <View accessible={false} style={{ width: iconSize.check, alignItems: "center" }}>
        {item.selected ? <CheckGlyph size={iconSize.check} strokeWidth={2.6} color={colors.accent} /> : null}
      </View>
    </Pressable>
  );
}
