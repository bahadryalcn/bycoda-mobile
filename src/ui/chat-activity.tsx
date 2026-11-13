import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Sparkles from "lucide-react-native/icons/sparkles";
import CircleCheck from "lucide-react-native/icons/circle-check";
import Terminal from "lucide-react-native/icons/terminal";
import { Reasoning } from "panelui-native/components/reasoning";
import { Task, type TaskStatus } from "panelui-native/components/task";
import { Shimmer } from "panelui-native/components/shimmer";
import { Plan } from "panelui-native/components/plan";
import { useHostReadActive } from "@/state/queries";
import { useReducedMotionPreference } from "./use-reduced-motion";
import { Body } from "./typography";
import { fontSize, gapIcon, lineHeight, metrics, radii, space } from "./tokens";
import { useMobileTheme } from "./theme";
import { useCopy } from "./copy";
import { activityFileLabel } from "./activity-file-label";

export type ChatActivityStatus = TaskStatus | "stopped" | "record";

/** Localized status, natural wrapping and one shared 48dp disclosure target. */
export function ChatActivity({
  title,
  detail,
  status = "pending",
  reasoning = false,
  children,
  onInspect,
}: {
  title: string;
  detail?: string;
  status?: ChatActivityStatus;
  reasoning?: boolean;
  children?: ReactNode;
  /** In virtualized timelines, inspect in the feature-owned sheet instead of expanding. */
  onInspect?: () => void;
}) {
  const { colors, pressedFill } = useMobileTheme();
  const copy = useCopy();
  const reduceMotion = useReducedMotionPreference();
  const active = useHostReadActive();
  const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState(false);
  const onOpenChange = (next: boolean) => {
    if (onInspect) {
      if (next) onInspect();
      return;
    }
    setOpen(next);
    if (next) setVisited(true);
  };
  const Icon = reasoning ? Sparkles : status === "complete" ? CircleCheck : Terminal;
  const statusColor =
    status === "error"
      ? colors.danger
      : status === "stopped"
        ? colors.warning
        : status === "running"
          ? colors.info
          : status === "complete"
            ? colors.success
            : colors.muted;
  const statusLabel =
    status === "error"
      ? copy("Başarısız", "Failed")
      : status === "stopped"
        ? copy("Durduruldu", "Interrupted")
        : status === "running"
          ? copy("Çalışıyor", "Running")
          : status === "complete"
            ? copy("Tamamlandı", "Completed")
            : status === "record"
              ? copy("İşlem kaydı", "Action record")
              : copy("Bekliyor", "Pending");
  const fileLabel = reasoning ? { title, directory: undefined } : activityFileLabel(title);
  const visibleTitle = fileLabel.title;
  const accessibleLabel = [...new Set([title, statusLabel, detail].filter(Boolean))].join(". ");
  // Collapsed rows are one muted line; only states that need attention add a colored word.
  const trailing =
    status === "error" || status === "stopped"
      ? statusLabel
      : detail && detail !== visibleTitle && status !== "running"
        ? detail
        : undefined;
  const titleStyle = {
    fontSize: fontSize.control,
    lineHeight: lineHeight.control,
    color: status === "error" ? colors.danger : colors.muted,
  };
  const Chevron = onInspect ? ChevronRight : ChevronDown;
  const header = (
    <>
      <View style={{ width: 20, alignItems: "center", justifyContent: "center" }}>
        <Icon size={14} color={statusColor} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {status === "running" && !reduceMotion && visibleTitle.length < 60 ? (
          <Shimmer enabled={active} textStyle={titleStyle}>
            {visibleTitle}
          </Shimmer>
        ) : (
          <Body numberOfLines={2} style={titleStyle}>
            {visibleTitle}
          </Body>
        )}
      </View>
      {trailing ? (
        <Body
          numberOfLines={1}
          style={{
            flexShrink: 1,
            maxWidth: "40%",
            fontSize: fontSize.caption,
            lineHeight: lineHeight.caption,
            color: status === "error" ? colors.danger : status === "stopped" ? colors.warning : colors.tertiary,
          }}
        >
          {trailing}
        </Body>
      ) : null}
      <Chevron
        size={14}
        color={colors.tertiary}
        style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
      />
    </>
  );
  // An inspector opens a separate Sheet, not this row's inline disclosure.
  if (onInspect)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibleLabel}
        onPress={onInspect}
        style={({ pressed }) => ({
          minHeight: metrics.touchTarget,
          paddingVertical: space.xs,
          flexDirection: "row",
          alignItems: "center",
          gap: gapIcon / 2,
          borderRadius: radii.badge,
          backgroundColor: pressed ? pressedFill : "transparent",
        })}
      >
        {header}
      </Pressable>
    );
  if (reasoning)
    return (
      <Reasoning
        open={open}
        onOpenChange={onOpenChange}
        isStreaming={status === "running"}
        defaultOpen={false}
      >
        <Reasoning.Trigger
          className="min-h-12 py-1"
          accessibilityLabel={accessibleLabel}
          aria-expanded={open}
        >
          {header}
        </Reasoning.Trigger>
        {!onInspect ? <Reasoning.Content>{visited ? children : null}</Reasoning.Content> : null}
      </Reasoning>
    );
  return (
    <Task
      status={status === "stopped" || status === "record" ? "pending" : status}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Task.Trigger className="min-h-12 py-1" accessibilityLabel={accessibleLabel} aria-expanded={open}>
        {header}
      </Task.Trigger>
      {!onInspect ? (
        <Task.Content style={{ minWidth: 0 }}>{visited ? children : null}</Task.Content>
      ) : null}
    </Task>
  );
}

export function ChatStreaming({ label }: { label: string }) {
  const { uiStyles } = useMobileTheme();
  const reducedMotion = useReducedMotionPreference();
  const active = useHostReadActive();
  return (
    <Shimmer
      enabled={active && !reducedMotion}
      accessibilityLabel={label}
      textStyle={uiStyles.caption}
    >
      {label}
    </Shimmer>
  );
}

export function ChatPlan({
  title,
  status,
  children,
  action,
  onOpenChange,
}: {
  title: string;
  status?: string;
  children: ReactNode;
  action?: ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  const { uiStyles } = useMobileTheme();
  return (
    <Plan defaultOpen onOpenChange={onOpenChange} className="min-w-0 rounded-none border-0 bg-transparent shadow-none">
      <Plan.Header style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
          <Plan.Title>
            <Body style={[uiStyles.label, { fontWeight: "600" }]}>{title}</Body>
          </Plan.Title>
          {status ? (
            <Body muted style={uiStyles.caption}>
              {status}
            </Body>
          ) : null}
        </View>
        <Plan.Action>
          <Plan.Trigger className="min-h-12 min-w-12" accessibilityLabel={title} />
        </Plan.Action>
      </Plan.Header>
      <Plan.Content>{children}</Plan.Content>
      {action ? <Plan.Footer>{action}</Plan.Footer> : null}
    </Plan>
  );
}
