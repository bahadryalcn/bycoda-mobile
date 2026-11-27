import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { AccessibilityInfo, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated from "react-native-reanimated";
import { Fab } from "panelui-native/components/fab";
import { Glass, useGlassMaterial } from "panelui-native/primitives/glass";
import { decorativeSvgProps } from "./accessibility";
import { PressableArea } from "./buttons";
import { reveal } from "./motion";
import { SweepLabel } from "./text-sweep";
import { useMobileTheme } from "./theme";
import { Body } from "./typography";
import { fontSize, iconSize, lineHeight, metrics, radii, space } from "./tokens";

type Icon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

export type FloatingStatusSegment = {
  key: string;
  text: string;
  /** Spoken label; the visible text when omitted. Keep ticking clocks out of it. */
  label?: string;
  /**
   * Said politely by the screen reader when it appears or changes (a state the owner should hear,
   * like "Needs you" or "Done"). Never a ticking clock.
   */
  announcement?: string;
  Icon?: Icon;
  tone?: "default" | "accent" | "warning" | "danger" | "success";
  /** Working states sweep like the transcript's live row. */
  busy?: boolean;
  /** Without a handler the segment is static text, not a button. */
  onPress?: () => void;
};

/** Border of the plain (non-glass) surface on each side. */
const CAPSULE_BORDER = 1;

/**
 * One floating status capsule over the end of a list: segments separated by hairlines, each its own
 * 48dp target. It is drawn in the system glass material where iOS has it and otherwise on the
 * floating (`popover`) surface, like the floating buttons. Every segment stays on one line and
 * truncates; at large text sizes the segments wrap into at most two rows (with more than two
 * segments each takes at most half the width), and a row never starts with a hairline. Touches
 * between the segments reach the list underneath.
 */
export function FloatingStatusCapsule({
  segments,
  onLayout,
}: {
  segments: readonly FloatingStatusSegment[];
  /** The capsule's own frame, for a list that reserves its height. */
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { colors } = useMobileTheme();
  // The material stops drawing under a fade and never comes back, so only the plain surface fades in.
  const material = useGlassMaterial();
  const [width, setWidth] = useState(0);
  // Each segment's measured top: a hairline separates two segments only on the same row.
  const [tops, setTops] = useState<Readonly<Record<string, number>>>({});
  if (!segments.length) return null;
  const inner = Math.max(0, width - 2 * (space.xs + CAPSULE_BORDER));
  const segmentMax = inner > 0 ? (segments.length > 2 ? Math.floor(inner / 2) : inner) : undefined;
  const capsule = (
    <Glass
      pointerEvents="box-none"
      onLayout={onLayout}
      radius={radii.composer}
      fallbackClassName="border border-border bg-popover"
      style={{ maxWidth: "100%", flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", paddingHorizontal: space.xs }}
    >
      {segments.map((segment, index) => {
        const previous = segments[index - 1];
        const top = tops[segment.key];
        const previousTop = previous ? tops[previous.key] : undefined;
        const divider = !!previous && (top === undefined || previousTop === undefined || top === previousTop);
        return (
          <View
            key={segment.key}
            pointerEvents="box-none"
            onLayout={(event) => {
              const y = Math.round(event.nativeEvent.layout.y);
              setTops((current) => (current[segment.key] === y ? current : { ...current, [segment.key]: y }));
            }}
            style={{ flexShrink: 1, maxWidth: segmentMax }}
          >
            <Segment segment={segment} />
            {divider ? (
              <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={{ position: "absolute", start: 0, top: 0, bottom: 0, justifyContent: "center" }}>
                <View style={{ width: StyleSheet.hairlineWidth, height: lineHeight.control, backgroundColor: colors.separator }} />
              </View>
            ) : null}
          </View>
        );
      })}
    </Glass>
  );
  return (
    <View
      pointerEvents="box-none"
      onLayout={(event) => {
        const next = Math.floor(event.nativeEvent.layout.width);
        setWidth((current) => (current === next ? current : next));
      }}
      style={{ alignSelf: "stretch", alignItems: "center" }}
    >
      {material ? capsule : <Animated.View pointerEvents="box-none" entering={reveal} style={{ maxWidth: "100%" }}>{capsule}</Animated.View>}
    </View>
  );
}

function Segment({ segment }: { segment: FloatingStatusSegment }) {
  const { colors } = useMobileTheme();
  const { Icon, text, busy, onPress, announcement } = segment;
  // A polite announcement on both platforms: an Android live region stays silent when the segment
  // first appears (the common "Needs you" case), and iOS has no live regions at all.
  useEffect(() => {
    if (announcement) AccessibilityInfo.announceForAccessibilityWithOptions(announcement, { queue: true, priority: "low" });
  }, [announcement]);
  const ink =
    segment.tone === "accent" ? colors.accent
      : segment.tone === "warning" ? colors.warning
        : segment.tone === "danger" ? colors.danger
          : segment.tone === "success" ? colors.success
            : colors.text;
  const style = { fontSize: fontSize.control, lineHeight: lineHeight.control, fontVariant: ["tabular-nums" as const] };
  const content = (
    <>
      {Icon ? <Icon {...decorativeSvgProps} size={iconSize.inline} color={segment.tone && segment.tone !== "default" ? ink : colors.muted} strokeWidth={2} /> : null}
      {busy ? (
        <SweepLabel active priority={2} color={colors.muted} style={style} frame={{ flexShrink: 1 }}>{text}</SweepLabel>
      ) : (
        <Body selectable={false} numberOfLines={1} style={[style, { color: ink, flexShrink: 1 }]}>{text}</Body>
      )}
    </>
  );
  const frame = { minHeight: metrics.touchTarget, flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, flexShrink: 1 } as const;
  if (!onPress)
    return (
      <View accessible accessibilityRole="text" accessibilityLabel={segment.label ?? text} style={frame}>
        {content}
      </View>
    );
  return (
    <PressableArea label={segment.label ?? text} onPress={onPress} style={frame}>
      {content}
    </PressableArea>
  );
}

/** Circular floating control (e.g. back to latest) in the same material as the capsule. */
export function FloatingRoundButton({
  label,
  icon,
  badge = false,
  onPress,
  onLayout,
}: {
  label: string;
  icon: ReactNode;
  /** A small accent dot: something new is waiting where this button leads. */
  badge?: boolean;
  onPress: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { colors } = useMobileTheme();
  const material = useGlassMaterial();
  // The 44dp circle takes 2dp of slop on each side to keep a 48dp target.
  const slop = (metrics.touchTarget - 44) / 2;
  const button = (
    <View onLayout={onLayout}>
      <Fab size="sm" variant="surface" glass hitSlop={slop} accessibilityLabel={label} onPress={onPress} icon={icon} />
      {badge ? (
        <View pointerEvents="none" style={{ position: "absolute", top: space.xxs, end: space.xxs, width: space.sm + space.xxs, height: space.sm + space.xxs, borderRadius: radii.pill, backgroundColor: colors.accentSolid }} />
      ) : null}
    </View>
  );
  return material ? button : <Animated.View entering={reveal}>{button}</Animated.View>;
}
