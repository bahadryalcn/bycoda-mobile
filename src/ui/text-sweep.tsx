import { useEffect, useState, type ReactNode } from "react";
import type { LayoutChangeEvent, StyleProp, TextStyle, ViewStyle } from "react-native";
import { Shimmer } from "panelui-native/components/shimmer";
import { useAnimationLead } from "./animation-lead";
import { useFeedbackAnimation } from "./use-feedback-animation";
import { useMobileTheme } from "./theme";
import { Body } from "./typography";

/** Desktop's sweep band (4.5rem): the light is a fixed width, whatever the label's length. */
export const SWEEP_BAND = 72;
/** One pass of the band across a line, in ms. */
const SWEEP_DURATION = 1800;

/**
 * Whether a sweep that started at `since` may still move: it stops for good `capMs` later, so a
 * message that waits a long time settles to still text instead of shimmering forever.
 */
export function sweepWithinCap(since: number | undefined, capMs: number | undefined, now = Date.now()) {
  if (since === undefined || capMs === undefined) return true;
  return now - since < capMs;
}

/** Milliseconds until a capped sweep must stop; undefined when it never does. */
export function sweepRemaining(since: number | undefined, capMs: number | undefined, now = Date.now()) {
  if (since === undefined || capMs === undefined) return undefined;
  return Math.max(0, capMs - (now - since));
}

/**
 * The working-text treatment shared with desktop's WorkingIndicator: the letters stay in place in
 * their resting ink while a soft band of full ink travels through them. PanelUI `Shimmer` owns the
 * masked sweep on the UI thread; this facade fixes the band width, the inks, the single-animation
 * lead, reduced motion, hidden routes and an optional time cap.
 *
 * `children` is used as the mask and is rendered twice, so it must be plain, non-interactive
 * content (a label or the text of a message), never a stateful or pressable subtree.
 */
export function TextSweep({
  active,
  children,
  color,
  ink,
  style,
  priority = 0,
  since,
  capMs,
}: {
  /** The work is in flight. Off renders the children as they are. */
  active: boolean;
  children: ReactNode;
  /** Resting ink of the content; defaults to the muted text color. */
  color?: string;
  /** Ink at the centre of the band; defaults to the full text color. */
  ink?: string;
  style?: StyleProp<ViewStyle>;
  /** Animation lead priority; the screen's main live row outranks secondary ones. */
  priority?: number;
  /** Epoch ms the work started, for `capMs`. */
  since?: number;
  /** Stop moving this long after `since`. */
  capMs?: number;
}) {
  const { colors } = useMobileTheme();
  const feedback = useFeedbackAnimation();
  const [expired, setExpired] = useState(() => !sweepWithinCap(since, capMs));
  useEffect(() => {
    const remaining = sweepRemaining(since, capMs);
    setExpired(remaining === 0);
    if (!active || !remaining) return;
    const timer = setTimeout(() => setExpired(true), remaining);
    return () => clearTimeout(timer);
  }, [active, since, capMs]);
  const animate = useAnimationLead(active && feedback && !expired, priority);
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return (
    <Shimmer
      as="view"
      enabled={animate}
      duration={SWEEP_DURATION}
      spread={width > 0 ? SWEEP_BAND / width : 1}
      baseColor={color ?? colors.muted}
      shimmerColor={ink ?? colors.text}
      onLayout={onLayout}
      style={style}
    >
      {children}
    </Shimmer>
  );
}

/** A one-line label with the sweep while `active`; still text otherwise. */
export function SweepLabel({
  active,
  children,
  style,
  color,
  numberOfLines = 1,
  priority,
  since,
  capMs,
  frame,
}: {
  active: boolean;
  children: string;
  style?: StyleProp<TextStyle>;
  color?: string;
  numberOfLines?: number;
  priority?: number;
  since?: number;
  capMs?: number;
  frame?: StyleProp<ViewStyle>;
}) {
  const { colors } = useMobileTheme();
  const ink = color ?? colors.muted;
  return (
    <TextSweep active={active} color={ink} priority={priority} since={since} capMs={capMs} style={frame}>
      <Body numberOfLines={numberOfLines} selectable={false} style={[style, { color: ink }]}>
        {children}
      </Body>
    </TextSweep>
  );
}
