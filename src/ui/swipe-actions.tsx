import {
  cloneElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { Platform, View } from "react-native";
import { Swipe, type SwipeHandle } from "panelui-native/components/swipe";
import { usePrivateContentAccess } from "./private-access";
import { useMobileTheme } from "./theme";
import { colors, metrics, opacity, semanticColors } from "./tokens";

export type SwipeRowAction = {
  key: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onPress(): void;
};

/** Reveal only. A full swipe never executes an operation without tapping its action. */
export function SwipeActions({
  actions,
  disabled,
  children,
}: PropsWithChildren<{
  actions: readonly SwipeRowAction[];
  disabled?: boolean;
}>) {
  useMobileTheme();
  const access = usePrivateContentAccess();
  const swipe = useRef<SwipeHandle>(null);
  const surface = useRef<View>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const element = surface.current as unknown as HTMLElement | null;
    if (!element) return;
    let origin: { x: number; y: number } | null = null;
    let dragged = false;
    const start = (event: PointerEvent) => {
      origin = { x: event.clientX, y: event.clientY };
      dragged = false;
    };
    const move = (event: PointerEvent) => {
      if (
        origin &&
        (Math.abs(event.clientX - origin.x) > 12 || Math.abs(event.clientY - origin.y) > 14)
      )
        dragged = true;
    };
    // Native gestures cancel Pressable. Browsers can still dispatch a click after a pan.
    const click = (event: MouseEvent) => {
      if (dragged && event.detail !== 0) {
        event.preventDefault();
        event.stopPropagation();
      }
      origin = null;
      dragged = false;
    };
    element.addEventListener("pointerdown", start, true);
    element.addEventListener("pointermove", move, true);
    element.addEventListener("click", click, true);
    return () => {
      element.removeEventListener("pointerdown", start, true);
      element.removeEventListener("pointermove", move, true);
      element.removeEventListener("click", click, true);
    };
  }, []);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const available = !disabled && access.allowed && access.check();
  const current = useRef({ available, access, actions });
  current.current = { available, access, actions };
  useEffect(() => {
    if (!available) swipe.current?.close();
  }, [available]);
  return (
    <View ref={surface}>
      <Swipe ref={swipe} fullSwipe={false} disabled={!available} contentClassName="bg-background">
        <Swipe.End>
          {actions.map((action) => (
            <Swipe.Action
              key={action.key}
              label={action.label}
              icon={
                isValidElement<{ color?: string }>(action.icon)
                  ? cloneElement(action.icon, {
                      color: action.destructive ? semanticColors.danger.text : colors.text,
                    })
                  : action.icon
              }
              color={action.destructive ? "destructive" : "default"}
              labelClassName={action.destructive ? "text-danger" : "text-foreground"}
              style={{
                backgroundColor: action.destructive ? semanticColors.danger.surface : colors.fill,
                minHeight: metrics.touchTarget,
                minWidth: metrics.touchTarget,
                opacity: !available || action.disabled ? opacity.disabled : 1,
              }}
              accessibilityState={{ disabled: !available || !!action.disabled }}
              onPress={() => {
                const live = current.current;
                if (
                  mounted.current &&
                  live.available &&
                  live.access.check() &&
                  !action.disabled &&
                  live.actions.includes(action)
                )
                  action.onPress();
              }}
            />
          ))}
        </Swipe.End>
        <View style={{ backgroundColor: colors.background }}>{children}</View>
      </Swipe>
    </View>
  );
}

export function SwipeActionsGroup({ children }: PropsWithChildren) {
  return <Swipe.Group>{children}</Swipe.Group>;
}
