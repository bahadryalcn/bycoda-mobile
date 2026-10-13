import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Badge as GlueBadge, BadgeText } from "./gluestack/badge";
import { Spinner } from "./gluestack/spinner";
import { Alert } from "./gluestack/alert";
import { Skeleton as GlueSkeleton } from "./gluestack/skeleton";
import Animated from "react-native-reanimated";
import { reveal } from "./motion";
import Info from "lucide-react-native/icons/info";
import CircleCheck from "lucide-react-native/icons/circle-check";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import { Body } from "./typography";
import { Row } from "./layout";
import { Button } from "./buttons";
import { colors, semanticColors, space } from "./tokens";
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
  const semantic =
    tone === "default"
      ? undefined
      : semanticColors[tone === "active" || tone === "live" ? "info" : tone];
  return (
    <GlueBadge
      variant="outline"
      className="self-start rounded-badge px-ui-xs py-0 border-0 bg-raised"
      style={StyleSheet.flatten([
        { backgroundColor: colors.raised, borderColor: colors.border, borderWidth: 0 },
        semantic && { backgroundColor: semantic.surface, borderColor: semantic.border },
      ])}
    >
      <BadgeText
        selectable
        className="normal-case"
        style={StyleSheet.flatten([
          uiStyles.badge,
          {
            paddingHorizontal: 0,
            paddingVertical: 0,
            borderWidth: 0,
            backgroundColor: "transparent",
            color: semantic?.text ?? colors.muted,
          },
        ])}
      >
        {label}
      </BadgeText>
    </GlueBadge>
  );
}

export function Empty({ title, detail, compact = true, action }: EmptyProps) {
  return (
    <View
      style={{
        gap: space.sm,
        paddingVertical: compact ? space.lg : space.xl,
        paddingHorizontal: compact ? 0 : space.lg,
      }}
    >
      <Body style={uiStyles.label}>{title}</Body>
      {detail ? (
        <Body muted style={{ fontSize: 14, lineHeight: 20 }}>
          {detail}
        </Body>
      ) : null}
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          tone="primary"
          style={{ alignSelf: "flex-start" }}
        />
      ) : null}
    </View>
  );
}

export function Loading({ label, centered = false, showLabel = !!label }: LoadingProps) {
  const copy = useCopy();
  const content = (
    <>
      <Spinner size="small" color={colors.accent} />
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

export function Skeleton({ variant = "list" }: { variant?: "list" | "content" }) {
  const copy = useCopy();
  return (
    <Animated.View
      entering={reveal}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={copy("Yükleniyor…", "Loading…")}
      accessibilityState={{ busy: true }}
      style={{ gap: space.lg, paddingVertical: space.sm }}
    >
      {(variant === "list" ? [0, 1, 2] : [0, 1]).map((key) => (
        <View
          key={key}
          importantForAccessibility="no-hide-descendants"
          style={{ gap: space.sm, paddingVertical: space.sm }}
        >
          <GlueSkeleton
            className="motion-reduce:animate-none"
            style={{
              height: 14,
              width: key ? "52%" : "67%",
              backgroundColor: colors.raised,
              borderRadius: 4,
            }}
          />
          <GlueSkeleton
            className="motion-reduce:animate-none"
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
  const copy = useCopy();
  if (!error) return null;
  return (
    <Text selectable accessibilityRole="alert" style={uiStyles.error}>
      {errorMessage(error, copy, message)}
    </Text>
  );
}

export function ErrorNotice({ error, onRetry, retryLabel, message, children }: ErrorNoticeProps) {
  const copy = useCopy();
  if (!error) return null;
  return (
    <Notice
      tone="danger"
      message={errorMessage(error, copy, message)}
      onRetry={onRetry}
      retryLabel={retryLabel ?? copy("Yeniden dene", "Retry")}
    >
      {children}
    </Notice>
  );
}

export function Notice({ tone = "info", message, children, onRetry, retryLabel }: NoticeProps) {
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
  return (
    <Alert
      variant={tone === "danger" ? "destructive" : "default"}
      className={
        quiet
          ? "flex-col bg-transparent border-0 px-0 py-ui-xs gap-ui-sm"
          : "flex-col p-ui-md gap-ui-sm"
      }
      style={StyleSheet.flatten<ViewStyle>(
        quiet
          ? { gap: space.sm, paddingVertical: space.xs }
          : [uiStyles.notice, { backgroundColor: semantic.surface, borderColor: semantic.border }],
      )}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
        <Icon size={16} color={semantic.text} style={{ marginTop: 2 }} />
        <Body
          accessibilityRole={tone === "danger" ? "alert" : "text"}
          accessibilityLiveRegion="polite"
          style={[uiStyles.grow, { color: semantic.text, fontSize: 14, lineHeight: 20 }]}
        >
          {message}
        </Body>
      </View>
      {onRetry ? (
        <Button
          density="compact"
          label={retryLabel ?? copy("Yeniden dene", "Retry")}
          onPress={onRetry}
          style={{ alignSelf: "flex-start" }}
        />
      ) : null}
      {children}
    </Alert>
  );
}
