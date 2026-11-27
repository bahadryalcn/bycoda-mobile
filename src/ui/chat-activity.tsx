import { useState, type ReactNode } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Sparkles from "lucide-react-native/icons/sparkles";
import CircleStop from "lucide-react-native/icons/circle-stop";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import FileIcon from "lucide-react-native/icons/file";
import { Reasoning } from "panelui-native/components/reasoning";
import { Task, type TaskStatus } from "panelui-native/components/task";
import { Shimmer } from "panelui-native/components/shimmer";
import { Plan } from "panelui-native/components/plan";
import { ThinkingOrb, type ThinkingOrbState } from "panelui-native/components/thinking-orb";
import { useHostReadActive } from "@/state/queries";
import { useReducedMotionPreference } from "./use-reduced-motion";
import { useFeedbackAnimation } from "./use-feedback-animation";
import { useAnimationLead } from "./animation-lead";
import { Body } from "./typography";
import { fontSize, gapIcon, hitSlopFor, lineHeight, metrics, radii, space } from "./tokens";
import { useMobileTheme } from "./theme";
import { useCopy } from "./copy";
import { activityFileLabel } from "./activity-file-label";

export type ChatActivityStatus = TaskStatus | "stopped" | "record";

/** One line of an expanded activity: a verb, then a file chip, a command or prose. */
export type ChatActivityStep = {
  id: string;
  label: string;
  file?: string;
  code?: string;
  text?: string;
  state: "running" | "failed" | "done";
  /** Lines the step added and removed ("+12 −3"). */
  delta?: { added: number; removed: number };
};

/** Steps beyond this stay in the inspector, so one long turn cannot flood the transcript. */
const VISIBLE_STEPS = 8;
const STEP_HEIGHT = 32;
/** PanelUI's small orb tuning, sized to sit in a line of text. */
const ORB_SIZE = 16;

/**
 * Agent work as PanelUI Task: a status glyph and what the work added up to, opening onto the
 * steps behind it ("Opened [a.ts]"). Each step opens the feature-owned inspector.
 */
export function ChatActivity({
  title,
  detail,
  status = "pending",
  reasoning = false,
  steps,
  defaultOpen = false,
  busy = "working",
  children,
  onInspect,
}: {
  title: string;
  detail?: string;
  status?: ChatActivityStatus;
  reasoning?: boolean;
  /** Inline record of the work; without it the row opens `onInspect` directly. */
  steps?: readonly ChatActivityStep[];
  defaultOpen?: boolean;
  /** Which kind of busy a running row is, for its ThinkingOrb. */
  busy?: ThinkingOrbState;
  children?: ReactNode;
  /** Opens the feature-owned inspector, at one step when an id is given. */
  onInspect?: (stepId?: string) => void;
}) {
  const { colors, pressedFill } = useMobileTheme();
  const copy = useCopy();
  // Route focus, foreground and window focus as well as reduced motion: an orb under the shade
  // or on a stacked route keeps redrawing an SVG for nobody.
  const feedback = useFeedbackAnimation();
  const active = useHostReadActive();
  const animate = useAnimationLead(status === "running" && active && feedback);
  const inline = !!steps?.length;
  const [open, setOpen] = useState(inline && defaultOpen);
  const [visited, setVisited] = useState(open);
  const onOpenChange = (next: boolean) => {
    if (onInspect && !inline) {
      if (next) onInspect();
      return;
    }
    setOpen(next);
    if (next) setVisited(true);
  };
  // Like desktop, settled work carries no success glyph: only running, failed, stopped and reasoning rows do.
  const Icon = reasoning
    ? Sparkles
    : status === "error"
      ? TriangleAlert
      : status === "stopped"
        ? CircleStop
        : undefined;
  const iconColor = status === "error" ? colors.danger : colors.muted;
  const statusLabel =
    status === "error"
      ? copy("Başarısız", "Failed")
      : status === "stopped"
        ? copy("Durduruldu", "Stopped")
        : status === "running"
          ? copy("Çalışıyor", "Working")
          : status === "complete"
            ? copy("Tamamlandı", "Completed")
            : status === "record"
              ? copy("İşlem kaydı", "Action record")
              : copy("Bekliyor", "Pending");
  const fileLabel = reasoning ? { title, directory: undefined } : activityFileLabel(title);
  const visibleTitle = fileLabel.title;
  const accessibleLabel = [...new Set([title, statusLabel, detail].filter(Boolean))].join(". ");
  // A single tool row keeps its command literal; a group title is prose.
  const literal = !reasoning && !inline && !children;
  // The glyph carries the state; the title says what the work was, like PanelUI Task.
  const titleStyle = {
    fontSize: fontSize.control,
    lineHeight: lineHeight.control,
    color: status === "error" ? colors.danger : colors.muted,
  };
  // Desktop's "Worked for 46 s ›": the chevron follows the words and turns down while open.
  const header = (
    <>
      {status === "running" || Icon ? (
        <View style={{ width: 20, alignItems: "center", justifyContent: "center" }}>
          {status === "running" ? (
            <ThinkingOrb state={reasoning ? "solving" : busy} size={ORB_SIZE} color={colors.muted} paused={!animate} />
          ) : Icon ? (
            <Icon size={16} color={iconColor} />
          ) : null}
        </View>
      ) : null}
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <ActivityLine running={status === "running"} animate={animate} mono={literal} style={titleStyle}>
          {visibleTitle}
        </ActivityLine>
      </View>
      <ChevronRight
        size={14}
        color={colors.tertiary}
        style={{ transform: [{ rotate: open && inline ? "90deg" : "0deg" }] }}
      />
      <View style={{ flex: 1 }} />
    </>
  );
  // Without an inline record, the row is a button into the inspector Sheet.
  if (onInspect && !inline)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibleLabel}
        onPress={() => onInspect()}
        style={({ pressed }) => ({
          minHeight: metrics.touchTarget,
          paddingVertical: space.xs,
          flexDirection: "row",
          alignItems: "center",
          gap: gapIcon,
          borderRadius: radii.badge,
          backgroundColor: pressed ? pressedFill : "transparent",
        })}
      >
        {header}
      </Pressable>
    );
  if (reasoning && !inline)
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
        <Reasoning.Content>{visited ? children : null}</Reasoning.Content>
      </Reasoning>
    );
  const hidden = inline ? steps.length - VISIBLE_STEPS : 0;
  return (
    <Task
      status={status === "stopped" || status === "record" ? "pending" : status}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Task.Trigger
        className="min-h-12 py-1"
        accessibilityLabel={accessibleLabel}
        aria-expanded={open}
      >
        {header}
      </Task.Trigger>
      {/* Collapse spreads props after its own measuring style, so a `style` here would break the open animation. */}
      <Task.Content className="min-w-0">
        {!visited ? null : inline ? (
          <>
            {(hidden > 0 ? steps.slice(-VISIBLE_STEPS) : steps).map((step) => (
              <ChatActivityStepRow
                key={step.id}
                step={step}
                onPress={onInspect ? () => onInspect(step.id) : undefined}
              />
            ))}
            {onInspect ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={hitSlopFor(STEP_HEIGHT)}
                onPress={() => onInspect()}
                style={({ pressed }) => ({
                  minHeight: STEP_HEIGHT,
                  justifyContent: "center",
                  alignSelf: "flex-start",
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Body style={{ fontSize: fontSize.caption, lineHeight: lineHeight.caption, color: colors.muted }}>
                  {hidden > 0
                    ? copy("{p0} adım daha · Tüm ayrıntılar", "{p0} more steps · All details", { p0: hidden })
                    : copy("Tüm ayrıntılar", "All details")}
                </Body>
              </Pressable>
            ) : null}
          </>
        ) : (
          children
        )}
      </Task.Content>
    </Task>
  );
}

/** The idle and running verb share one flex frame, so the row keeps its geometry when the step settles. */
const STEP_VERB_FRAME = { flexShrink: 0, maxWidth: "60%" } as const;

/**
 * One line of activity text in every state. PanelUI `Shimmer` in its default mode renders a bare
 * `Text` with no `numberOfLines`, so a long command wrapped while streaming and collapsed when done;
 * here the shimmer masks a one-line `Body`, so running and settled rows measure the same.
 */
function ActivityLine({
  running,
  animate,
  mono,
  style,
  frame,
  children,
}: {
  running: boolean;
  /** Whether the owning row holds the animation lead; a still shimmer shows its plain text. */
  animate: boolean;
  mono?: boolean;
  style: { fontSize: number; lineHeight: number; color: string };
  /** Flex constraints for the line, applied to the shimmer frame or the text itself. */
  frame?: ViewStyle;
  children: string;
}) {
  const reduceMotion = useReducedMotionPreference();
  if (running && !reduceMotion)
    return (
      <Shimmer as="view" enabled={animate} baseColor={style.color} style={frame}>
        <Body mono={mono} numberOfLines={1} style={style}>
          {children}
        </Body>
      </Shimmer>
    );
  return (
    <Body mono={mono} numberOfLines={1} style={frame ? [style, frame] : style}>
      {children}
    </Body>
  );
}

/** "Opened [a.ts]": muted verb, then the target a reader scans for. */
function ChatActivityStepRow({ step, onPress }: { step: ChatActivityStep; onPress?: () => void }) {
  const { colors, pressedFill } = useMobileTheme();
  const failed = step.state === "failed";
  const feedback = useFeedbackAnimation();
  const active = useHostReadActive();
  const animate = useAnimationLead(step.state === "running" && active && feedback, -1);
  const verbStyle = {
    fontSize: fontSize.control,
    lineHeight: lineHeight.control,
    color: failed ? colors.danger : colors.muted,
  };
  const target = step.file ? (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        flexShrink: 1,
        minWidth: 0,
        paddingHorizontal: space.sm,
        paddingVertical: space.xxs,
        borderRadius: radii.badge,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.raised,
      }}
    >
      <FileIcon size={12} color={colors.muted} />
      <Body mono numberOfLines={1} style={{ flexShrink: 1, fontSize: fontSize.caption, lineHeight: lineHeight.caption, color: colors.text }}>
        {step.file}
      </Body>
    </View>
  ) : step.code || step.text ? (
    <Body
      mono={!!step.code}
      numberOfLines={1}
      style={{
        flexShrink: 1,
        minWidth: 0,
        fontSize: step.code ? fontSize.caption : fontSize.control,
        lineHeight: step.code ? lineHeight.caption : lineHeight.control,
        color: step.code ? colors.text : colors.muted,
      }}
    >
      {step.code ?? step.text}
    </Body>
  ) : null;
  const delta = step.delta && (step.delta.added || step.delta.removed) ? (
    <Body
      mono
      numberOfLines={1}
      style={{ flexShrink: 0, fontSize: fontSize.caption, lineHeight: lineHeight.caption, fontVariant: ["tabular-nums"] }}
    >
      <Body mono style={{ fontSize: fontSize.caption, lineHeight: lineHeight.caption, color: colors.success }}>{`+${step.delta.added}`}</Body>
      {" "}
      <Body mono style={{ fontSize: fontSize.caption, lineHeight: lineHeight.caption, color: colors.danger }}>{`−${step.delta.removed}`}</Body>
    </Body>
  ) : null;
  const content = (
    <>
      <ActivityLine running={step.state === "running"} animate={animate} style={verbStyle} frame={STEP_VERB_FRAME}>
        {step.label}
      </ActivityLine>
      {target}
      {delta}
    </>
  );
  const rowStyle = {
    minHeight: STEP_HEIGHT,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: space.sm,
    minWidth: 0,
  };
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        step.label,
        step.file ?? step.code ?? step.text,
        step.delta ? `+${step.delta.added} −${step.delta.removed}` : undefined,
      ].filter(Boolean).join(" ")}
      hitSlop={{ top: (metrics.touchTarget - STEP_HEIGHT) / 2, bottom: (metrics.touchTarget - STEP_HEIGHT) / 2 }}
      onPress={onPress}
      style={({ pressed }) => [rowStyle, { borderRadius: radii.badge, backgroundColor: pressed ? pressedFill : "transparent" }]}
    >
      {content}
    </Pressable>
  );
}

/** PanelUI's inline busy line: an orb saying which kind of busy, beside the shimmering label. */
export function ChatStreaming({
  label,
  state = "working",
  priority = 1,
}: {
  label: string;
  state?: ThinkingOrbState;
  /** Animation lead priority: the screen's main busy line outranks in-transcript lines. */
  priority?: number;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const feedback = useFeedbackAnimation();
  const active = useHostReadActive();
  const animate = useAnimationLead(active && feedback, priority);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <ThinkingOrb state={state} size={ORB_SIZE} color={colors.muted} paused={!animate} accessibilityLabel={label} />
      <Shimmer
        enabled={animate}
        accessibilityLabel={label}
        textStyle={uiStyles.caption}
      >
        {label}
      </Shimmer>
    </View>
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
