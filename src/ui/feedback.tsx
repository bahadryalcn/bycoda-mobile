import { useMobileTheme } from "./theme";
import { StyleSheet, Text, View } from "react-native";
import { Badge as PanelBadge } from "panelui-native/components/badge";
import { Spinner } from "panelui-native/components/spinner";
import { Alert } from "panelui-native/components/alert";
import { Skeleton as PanelSkeleton } from "panelui-native/components/skeleton";
import Animated from "react-native-reanimated";
import { reveal } from "./motion";
import Info from "lucide-react-native/icons/info";
import CircleCheck from "lucide-react-native/icons/circle-check";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import { Body } from "./typography";
import { Row } from "./layout";
import { Button } from "./buttons";
import { colors, radii, semanticColors, space } from "./tokens";
import { useFeedbackAnimation } from "./use-feedback-animation";
import { uiStyles } from "./styles";
import { useCopy } from "./copy";
import { errorMessage } from "./error-message";
import type {
  BadgeProps,
  EmptyProps,
  LoadingProps,
  ErrorTextProps,
  ErrorNoticeProps,
  NoticeProps,
} from "./component-props";

export function Badge({ label, tone = "default" }: BadgeProps) {
  useMobileTheme();
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
            lineHeight: 18,
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

export function Empty({ title, detail, compact = true, action }: EmptyProps) {
  useMobileTheme();
  return (
    <Animated.View
      entering={reveal}
      style={{
        gap: space.sm,
        alignItems: "center",
        paddingVertical: compact ? space.xl : space.xxl * 2,
        paddingHorizontal: space.xl,
      }}
    >
      <Body style={[compact ? uiStyles.title : uiStyles.heading, { textAlign: "center" }]}>
        {title}
      </Body>
      {detail ? (
        <Body muted style={[uiStyles.caption, { textAlign: "center", maxWidth: 320 }]}>
          {detail}
        </Body>
      ) : null}
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          tone="primary"
          style={{ alignSelf: "center", marginTop: space.sm }}
        />
      ) : null}
    </Animated.View>
  );
}

export function Loading({ label, centered = false, showLabel = !!label }: LoadingProps) {
  useMobileTheme();
  const copy = useCopy();
  const animate = useFeedbackAnimation();
  const content = (
    <>
      {animate ? <Spinner size="sm" color={colors.accent} /> : (
        <View accessible={false} style={{ width: 16, height: 16, borderRadius: radii.pill, borderWidth: 2, borderColor: colors.border, borderTopColor: colors.accent }} />
      )}
      {showLabel ? (
        <Body muted style={uiStyles.caption}>
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
      {content}
    </View>
  );
}

export function Skeleton({ variant = "list", label }: { variant?: "list" | "content"; label?: string }) {
  useMobileTheme();
  const copy = useCopy();
  const animate = useFeedbackAnimation();
  // Upstream has no pause prop. Unmount its loops and preserve the same shapes.
  const Placeholder = animate ? PanelSkeleton : View;
  return (
    <Animated.View
      entering={reveal}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? copy("Yükleniyor…", "Loading…")}
      accessibilityState={{ busy: true }}
      aria-busy
      style={{ gap: space.lg, paddingVertical: space.sm }}
    >
      {label ? <Body muted style={uiStyles.caption}>{label}</Body> : null}
      {(variant === "list" ? [0, 1, 2] : [0, 1]).map((key) => (
        <View
          key={key}
          importantForAccessibility="no-hide-descendants"
          style={{ gap: space.sm, paddingVertical: space.sm }}
        >
          <Placeholder
            style={{
              height: 14,
              width: key ? "52%" : "67%",
              backgroundColor: colors.raised,
              borderRadius: 4,
            }}
          />
          <Placeholder
            style={{
              height: variant === "content" ? 52 : 10,
              width: key ? "76%" : "91%",
              backgroundColor: colors.panel,
              borderRadius: 4,
            }}
          />
        </View>
      ))}
    </Animated.View>
  );
}

export function ErrorText({ error, message }: ErrorTextProps) {
  useMobileTheme();
  const copy = useCopy();
  if (!error) return null;
  return (
    <Text selectable accessibilityRole="alert" style={uiStyles.error}>
      {errorMessage(error, copy, message)}
    </Text>
  );
}

export function ErrorNotice({ error, onRetry, retryLabel, message, action, children }: ErrorNoticeProps) {
  useMobileTheme();
  const copy = useCopy();
  if (!error) return null;
  return (
    <Notice
      tone="danger"
      message={errorMessage(error, copy, message)}
      onRetry={onRetry}
      retryLabel={retryLabel ?? copy("Yeniden dene", "Retry")}
      action={action}
    >
      {children}
    </Notice>
  );
}

export function Notice({ tone = "info", message, children, onRetry, retryLabel, action }: NoticeProps) {
  useMobileTheme();
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
  const quiet = tone === "info" || tone === "success";
  const recovery = action ?? (onRetry ? { label: retryLabel ?? copy("Yeniden dene", "Retry"), onPress: onRetry } : undefined);
  return (
    <Alert
      variant={tone === "danger" ? "destructive" : "default"}
      accessibilityLiveRegion="polite"
      className="flex-col bg-transparent border-0 rounded-none p-0 gap-ui-xs"
      style={uiStyles.notice}
    >
      <View style={uiStyles.noticeRow}>
        <View style={uiStyles.noticeMessage}>
          <Icon size={16} strokeWidth={2} color={semantic.text} style={{ marginTop: 1 }} />
          <Body style={[uiStyles.grow, uiStyles.caption, { color: quiet ? colors.muted : colors.text }]}>
            {message}
          </Body>
        </View>
        {recovery ? <Button density="compact" tone="quiet" label={recovery.label}
          onPress={recovery.onPress} style={{ marginStart: "auto" }} /> : null}
      </View>
      {children}
    </Alert>
  );
}
