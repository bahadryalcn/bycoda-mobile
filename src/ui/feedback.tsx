import { useMobileTheme } from "./theme";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Badge as PanelBadge } from "panelui-native/components/badge";
import { Spinner } from "panelui-native/components/spinner";
import { Alert } from "panelui-native/components/alert";
import { Skeleton as PanelSkeleton } from "panelui-native/components/skeleton";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSkeletonHandoff } from "panelui-native/hooks/use-skeleton-handoff";
import { reveal } from "./motion";
import Info from "lucide-react-native/icons/info";
import CircleCheck from "lucide-react-native/icons/circle-check";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import { Body } from "./typography";
import { Button } from "./buttons";
import { lineHeight, metrics, radii, space } from "./tokens";
import { useDelayedVisible } from "./use-delayed-visible";
import { StateView } from "./state-view";
import { useFeedbackAnimation } from "./use-feedback-animation";
import { useCopy } from "./copy";
import { errorMessage } from "./error-message";
import type {
  BadgeProps,
  EmptyProps,
  LoadingProps,
  ErrorTextProps,
  ErrorNoticeProps,
  NoticeProps,
  FieldErrorProps,
} from "./component-props";
import type { SemanticTone } from "./tokens";

export function Badge({ label, tone = "default" }: BadgeProps) {
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const semantic =
    tone === "default"
      ? undefined
      : semanticColors[tone === "active" || tone === "live" ? "info" : tone];
  return (
    <PanelBadge
      variant="outline"
      className="self-start rounded-control border-0 bg-fill"
      style={StyleSheet.flatten([
        { alignSelf: "flex-start", maxWidth: "100%", flexDirection: "column", alignItems: "stretch", paddingHorizontal: space.sm, paddingVertical: space.xxs, backgroundColor: colors.fill, borderColor: colors.border, borderWidth: 0 },
        semantic && { backgroundColor: semantic.surface, borderColor: semantic.border },
      ])}
    >
      <Text
        selectable
        style={StyleSheet.flatten([
          {
            fontSize: uiStyles.badge.fontSize,
            lineHeight: lineHeight.badge,
            fontWeight: "600",
            fontVariant: ["tabular-nums"],
            flexShrink: 1,
            color: semantic?.text ?? colors.muted,
          },
        ])}
      >
        {label}
      </Text>
    </PanelBadge>
  );
}

/** Row status: colored 13/17 semibold text with an optional 6px dot, never a filled badge. */
export function StatusText({ label, tone = "default", dot = true }: {
  label: string; tone?: "default" | SemanticTone | "live" | "active"; dot?: boolean;
}) {
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const color = tone === "default" ? colors.muted
    : semanticColors[tone === "active" || tone === "live" ? "info" : tone].text;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs + 2, flexShrink: 1 }}>
      {dot ? <View accessible={false} style={[uiStyles.statusDot, { backgroundColor: color }]} /> : null}
      <Text numberOfLines={1} style={[uiStyles.statusText, { color, flexShrink: 1 }]}>{label}</Text>
    </View>
  );
}

/** Thin wrapper over StateView. `compact` (default) is the inline icon row for sub-sections. */
export function Empty({ title, detail, compact = true, action, secondaryAction, illustration }: EmptyProps) {
  return (
    <StateView
      title={title}
      description={detail}
      action={action}
      secondaryAction={secondaryAction}
      illustration={illustration}
      compact={compact}
    />
  );
}

export function Loading({ label, centered = false, showLabel = !!label || centered }: LoadingProps) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const animate = useFeedbackAnimation();
  // A full-region spinner waits like a skeleton, so a fast load never flashes it.
  const visible = useDelayedVisible(centered ? undefined : 0);
  const content = (
    <>
      {animate ? <Spinner size={centered ? "md" : "sm"} color={colors.accent} /> : (
        <View accessible={false} style={{ width: 16, height: 16, borderRadius: radii.pill, borderWidth: 2, borderColor: colors.border, borderTopColor: colors.accent }} />
      )}
      {showLabel ? (
        <Body muted style={centered ? uiStyles.stateDescription : uiStyles.caption}>
          {label ?? copy("Yükleniyor…", "Loading…")}
        </Body>
      ) : null}
    </>
  );
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? copy("Yükleniyor…", "Loading…")}
      accessibilityState={{ busy: true }}
      aria-busy
      style={
        centered
          ? uiStyles.loading
          : { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 24 }
      }
    >
      {visible ? content : null}
    </View>
  );
}

const TITLE_WIDTHS = ["62%", "48%", "70%", "55%", "66%", "44%"] as const;
const META_WIDTHS = ["38%", "30%", "44%", "34%", "40%", "28%"] as const;
const LINE_WIDTHS = ["92%", "86%", "95%", "64%"] as const;

/**
 * Region placeholder shaped like the content it replaces, so nothing jumps when data arrives:
 * `list` draws rows (leading tile, title, meta) at the session-row height; `content` draws a
 * heading and paragraph lines. It appears only after a short delay, so cached or fast loads never
 * flash it. `label` is announced to screen readers only; never put loading text above it.
 *
 * `loading` (default true) drives the hand-off: when it turns false a placeholder that was visible
 * stays a beat and dissolves as a zero-height overlay on top of whatever now sits in its place, so
 * the content never waits for it and nothing jumps. Keep it mounted across the change (QueryState
 * does) rather than unmounting it when data arrives.
 */
export function Skeleton({ variant = "list", label, rows, loading = true }: { variant?: "list" | "content"; label?: string; rows?: number; loading?: boolean }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const animate = useFeedbackAnimation();
  const revealed = useDelayedVisible();
  const { mounted, opacity } = useSkeletonHandoff(loading);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  // Never flashed while loading (delay not elapsed), so there is nothing to dissolve either.
  const visible = revealed && mounted;
  if (!loading && !visible) return null;
  // Upstream has no pause prop. Unmount its loops and preserve the same shapes.
  const Placeholder = animate ? PanelSkeleton : View;
  const bar = (height: number, width: string, fill = colors.raised) => (
    <Placeholder style={{ height, width: width as `${number}%`, backgroundColor: fill, borderRadius: 4 }} />
  );
  return (
    <Animated.View
      pointerEvents={loading ? "auto" : "none"}
      accessible={loading}
      accessibilityRole={loading ? "progressbar" : undefined}
      accessibilityLabel={loading ? (label ?? copy("Yükleniyor…", "Loading…")) : undefined}
      accessibilityState={{ busy: loading }}
      aria-busy={loading}
      importantForAccessibility={loading ? "auto" : "no-hide-descendants"}
      style={loading ? undefined : [handoffOverlay, fade]}
    >
      {visible ? (
        <Animated.View entering={reveal} importantForAccessibility="no-hide-descendants">
          {variant === "list"
            ? Array.from({ length: rows ?? 6 }, (_, index) => (
                <View
                  key={index}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.md,
                    minHeight: metrics.rowHeightSession,
                    paddingVertical: space.sm,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.separator,
                  }}
                >
                  <Placeholder style={{ width: 32, height: 32, borderRadius: radii.control, backgroundColor: colors.raised }} />
                  <View style={{ flex: 1, gap: space.sm }}>
                    {bar(14, TITLE_WIDTHS[index % TITLE_WIDTHS.length])}
                    {bar(10, META_WIDTHS[index % META_WIDTHS.length], colors.panel)}
                  </View>
                </View>
              ))
            : (
                <View style={{ gap: space.md, paddingVertical: space.sm }}>
                  {bar(18, "48%")}
                  {Array.from({ length: rows ?? 4 }, (_, index) => (
                    <View key={index}>{bar(12, LINE_WIDTHS[index % LINE_WIDTHS.length], colors.panel)}</View>
                  ))}
                </View>
              )}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/** Zero-height anchor: the dissolving placeholder paints over the content that replaced it. */
const handoffOverlay = { height: 0, overflow: "visible", zIndex: 1 } as const;

/** Field-level validation: 13/17 danger text with a 14px alert icon. */
export function FieldError({ message }: FieldErrorProps) {
  const { colors, uiStyles } = useMobileTheme();
  return (
    <View style={uiStyles.fieldError}>
      <CircleAlert size={14} strokeWidth={2} color={colors.danger} style={{ marginTop: 1.5 }} />
      <Text selectable accessibilityRole="alert" style={uiStyles.fieldErrorText}>{message}</Text>
    </View>
  );
}

export function ErrorText({ error, message }: ErrorTextProps) {
  const copy = useCopy();
  if (!error) return null;
  return <FieldError message={errorMessage(error, copy, message)} />;
}

export function ErrorNotice({ error, onRetry, retryLabel, retrying, message, action, children }: ErrorNoticeProps) {
  useMobileTheme();
  const copy = useCopy();
  if (!error) return null;
  return (
    <Notice
      tone="danger"
      message={errorMessage(error, copy, message)}
      onRetry={onRetry}
      retryLabel={retryLabel ?? copy("Yeniden dene", "Retry")}
      retrying={retrying}
      action={action}
    >
      {children}
    </Notice>
  );
}

export function Notice({ tone = "info", message, children, onRetry, retryLabel, retrying, action }: NoticeProps) {
  const { semanticColors, uiStyles } = useMobileTheme();
  const { fontScale } = useWindowDimensions();
  const copy = useCopy();
  const semantic = semanticColors[tone];
  const Icon =
    tone === "danger"
      ? CircleAlert
      : tone === "warning"
        ? TriangleAlert
        : tone === "success"
          ? CircleCheck
          : Info;
  const recovery = action ?? (onRetry ? { label: retryLabel ?? copy("Yeniden dene", "Retry"), onPress: onRetry } : undefined);
  return (
    <Alert
      variant={tone === "danger" ? "destructive" : "default"}
      accessibilityLiveRegion="polite"
      className="flex-col bg-transparent rounded-none p-0 gap-ui-xs"
      style={[uiStyles.notice, { backgroundColor: semantic.surface, borderColor: semantic.border }]}
    >
      {/* Own padding: the PanelUI Alert class resets padding, which glued text to the edge. */}
      <View style={uiStyles.noticeBody}>
      <View style={uiStyles.noticeRow}>
        <View style={[uiStyles.noticeMessage, { flexBasis: 128 * Math.max(1, fontScale) }]}>
          <Icon size={16} strokeWidth={2} color={semantic.text} style={{ marginTop: 2 }} />
          <Body style={[uiStyles.grow, uiStyles.noticeText]}>{message}</Body>
        </View>
        {recovery ? <Button density="compact" tone="quiet" label={recovery.label}
          busy={!action && retrying}
          onPress={recovery.onPress} style={{ marginStart: "auto" }} /> : null}
      </View>
      {children}
      </View>
    </Alert>
  );
}
