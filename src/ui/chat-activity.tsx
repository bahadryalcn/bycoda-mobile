import { useState, type ReactNode } from "react";
import { View } from "react-native";
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
import { colors, space } from "./tokens";
import { uiStyles } from "./styles";
import { useMobileTheme } from "./theme";

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
  status?: TaskStatus;
  reasoning?: boolean;
  children?: ReactNode;
  /** In virtualized timelines, inspect in the feature-owned sheet instead of expanding. */
  onInspect?: () => void;
}) {
  useMobileTheme();
  const reduceMotion = useReducedMotionPreference();
  const active = useHostReadActive();
  const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState(false);
  const onOpenChange = (next: boolean) => {
    if (onInspect) { if (next) onInspect(); return; }
    setOpen(next);
    if (next) setVisited(true);
  };
  const Icon = reasoning ? Sparkles : status === "complete" ? CircleCheck : Terminal;
  const Chevron = onInspect ? ChevronRight : ChevronDown;
  const header = (
    <>
      <Icon size={18} color={status === "error" ? colors.danger : colors.muted} />
      <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
        {status === "running" && !reduceMotion && title.length < 60 ? (
          <Shimmer enabled={active} textStyle={uiStyles.label}>{title}</Shimmer>
        ) : (
          <Body numberOfLines={open ? undefined : 2} style={[uiStyles.caption, { fontWeight: "600", color: status === "error" ? colors.danger : colors.text }]}>{title}</Body>
        )}
        {detail ? (
          <Body muted numberOfLines={open ? undefined : 1} style={uiStyles.caption}>
            {detail}
          </Body>
        ) : null}
      </View>
      <Chevron
        size={16}
        color={colors.muted}
        style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
      />
    </>
  );
  if (reasoning)
    return (
      <Reasoning
        open={open}
        onOpenChange={onOpenChange}
        isStreaming={status === "running"}
        defaultOpen={false}
      >
        <Reasoning.Trigger className="min-h-12" accessibilityLabel={title} aria-expanded={open}>
          {header}
        </Reasoning.Trigger>
        {!onInspect ? <Reasoning.Content>{visited ? children : null}</Reasoning.Content> : null}
      </Reasoning>
    );
  return (
    <Task status={status} open={open} onOpenChange={onOpenChange}>
      <Task.Trigger className="min-h-12" accessibilityLabel={title} aria-expanded={open}>
        {header}
      </Task.Trigger>
      {!onInspect ? <Task.Content style={{ minWidth: 0 }}>{visited ? children : null}</Task.Content> : null}
    </Task>
  );
}

export function ChatStreaming({ label }: { label: string }) {
  useMobileTheme();
  const reducedMotion = useReducedMotionPreference();
  const active = useHostReadActive();
  return (
    <Shimmer enabled={active && !reducedMotion} accessibilityLabel={label} textStyle={uiStyles.caption}>
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
  useMobileTheme();
  return (
    <Plan defaultOpen onOpenChange={onOpenChange} className="min-w-0">
      <Plan.Header style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
          <Plan.Title>
            <Body style={uiStyles.title}>{title}</Body>
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
