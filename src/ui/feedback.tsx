import { decorativeSvgProps } from "./accessibility";
import { useMobileTheme } from "./theme";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Badge as PanelBadge } from "panelui-native/components/badge";
import { Spinner } from "panelui-native/components/spinner";
import { Alert } from "panelui-native/components/alert";
import { Skeleton as PanelSkeleton } from "panelui-native/components/skeleton";
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

/** Compact tone pill; `icon` adds a decorative 12dp leading glyph in the badge ink. */
export function Badge({ label, tone = "default", icon: Icon }: BadgeProps) {
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const semantic =
    tone === "default"
      ? undefined
      : semanticColors[tone === "active" || tone === "live" ? "info" : tone];
  // The row wrapper keeps the pill content-sized and start-aligned in a column, and lets a row
  // parent centre it; a bare `alignSelf: flex-start` pinned it to the top of every row.
  return (
    <View style={{ flexDirection: "row", maxWidth: "100%" }}>
    <PanelBadge
      variant="outline"
      className="self-start rounded-control border-0 bg-fill"
      style={StyleSheet.flatten([
        { alignSelf: "flex-start", maxWidth: "100%", flexDirection: Icon ? "row" : "column", alignItems: Icon ? "center" : "stretch", gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xxs, backgroundColor: colors.fill, borderColor: colors.border, borderWidth: 0 },
        semantic && { backgroundColor: semantic.surface, borderColor: semantic.border },
      ])}
    >
      {Icon ? <Icon {...decorativeSvgProps} size={12} strokeWidth={2} color={semantic?.text ?? colors.muted} /> : null}
      <Text
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
    </View>
  );
}

/**
 * Row status. The normal state is quiet muted text without a dot; other tones add their colour and a
 * 6dp dot. Use a tinted `Badge` only for an exception the user must notice (failed, needs you).
 */
export function StatusText({ label, tone = "default", dot = tone !== "default" }: {
  label: string; tone?: "default" | SemanticTone | "live" | "active"; dot?: boolean;
}) {
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const color = tone === "default" ? colors.muted
    : semanticColors[tone === "active" || tone === "live" ? "info" : tone].text;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs + 2, flexShrink: 1 }}>
      {dot ? <View accessible={false} style={[uiStyles.statusDot, { backgroundColor: color }]} /> : null}
      <Text style={[uiStyles.statusText, { color, flexShrink: 1 }]}>{label}</Text>
    </View>
  );
}

/**
 * Thin wrapper over StateView. `compact` (default) is the inline icon row for a sub-section among
 * other content. When the empty state is all a page, list or sheet shows, pass `compact={false}`
 * with an `illustration` so it fills the region centered instead of leaving a blank page.
 */
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

export function Loading({ label, centered = false, showLabel = !!label || centered, immediate = false }: LoadingProps) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const animate = useFeedbackAnimation();
  // A full-region spinner waits like a skeleton, so a fast load never flashes it.
  const visible = useDelayedVisible(centered && !immediate ? undefined : 0);
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
 * heading and paragraph lines. Static shapes fill the first loading frame. Shimmer starts
 * only on longer reads. The resolved state immediately owns the region.
 */
export function Skeleton({ variant = "list", label, rows, loading = true }: { variant?: "list" | "content"; label?: string; rows?: number; loading?: boolean }) {
  const [regionHeight, setRegionHeight] = useState(0);
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const animate = useFeedbackAnimation();
  const shimmer = useDelayedVisible(undefined, loading);
  const rowCount = rows ?? (regionHeight > 0 ? Math.max(1, Math.floor(regionHeight / metrics.rowHeightSession)) : 6);
  if (!loading) return null;
  // Upstream has no pause prop. Unmount its loops and preserve the same shapes.
  const Placeholder = animate && shimmer ? PanelSkeleton : View;
  const bar = (height: number, width: string, fill = colors.raised) => (
    <Placeholder style={{ height, width: width as `${number}%`, backgroundColor: fill, borderRadius: 4 }} />
  );
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? copy("Yükleniyor…", "Loading…")}
      accessibilityState={{ busy: true }}
      aria-busy
      onLayout={variant === "list" && rows === undefined ? (event) => setRegionHeight(event.nativeEvent.layout.height) : undefined}
      style={variant === "list" && rows === undefined ? { flexGrow: 1 } : undefined}
    >
        <View importantForAccessibility="no-hide-descendants">
          {variant === "list"
            ? Array.from({ length: rowCount }, (_, index) => (
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
        </View>
    </View>
  );
}

/** Zero-height anchor: the dissolving placeholder paints over the content that replaced it. */

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

/** A notice message longer than this many lines collapses behind "Details". */
export const NOTICE_COLLAPSED_LINES = 2;

export function Notice({ tone = "info", message, children, onRetry, retryLabel, retrying, action }: NoticeProps) {
  const { semanticColors, uiStyles } = useMobileTheme();
  const { fontScale } = useWindowDimensions();
  const copy = useCopy();
  // Measured on an unclamped hidden copy; iOS reports only the visible lines of a clamped text.
  const [measured, setMeasured] = useState<{ message: string; lines: number } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
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
  const long = measured?.message === message && measured.lines > NOTICE_COLLAPSED_LINES;
  const open = expanded === message;
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
          <View style={uiStyles.grow}>
            <Body accessibilityLabel={message} numberOfLines={open ? undefined : NOTICE_COLLAPSED_LINES}
              style={uiStyles.noticeText}>{message}</Body>
            <Body accessible={false} importantForAccessibility="no-hide-descendants" aria-hidden
              onTextLayout={({ nativeEvent }) => setMeasured((current) =>
                current?.message === message && current.lines === nativeEvent.lines.length
                  ? current : { message, lines: nativeEvent.lines.length })}
              style={[uiStyles.noticeText, uiStyles.noticeMeasure]}>{message}</Body>
            {long ? (
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }}
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                onPress={() => setExpanded(open ? null : message)} style={{ alignSelf: "flex-start" }}>
                <Text style={[uiStyles.statusLineAction, { color: semantic.text }]}>
                  {open ? copy("Daha az", "Less") : copy("Ayrıntılar", "Details")}
                </Text>
              </Pressable>
            ) : null}
          </View>
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

export { StatusLine } from "./status-line";
