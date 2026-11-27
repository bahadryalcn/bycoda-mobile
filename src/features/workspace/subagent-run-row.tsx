import type { ReactNode } from "react";
import { View } from "react-native";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import { REMOTE_PROVIDERS } from "@/domain/providers";
import type { RemoteProvider } from "@/domain/types";
import { AgentAvatar } from "@/ui/agent-avatar";
import { ProviderIcon } from "@/ui/provider-identity";
import { SweepLabel } from "@/ui/text-sweep";
import { Body } from "@/ui/typography";
import { PressableCard } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, metrics, radii, space } from "@/ui/tokens";
import { agentStateLabel } from "./agent-state";
import { formatElapsed } from "./run-status-model";
import { isLiveRun, runAvatars, runElapsedMs, type RunTone, type SubagentRunView } from "./subagent-run-model";

/** Below the transcript's main live row, which leads the one-animation-at-a-time sweep. */
const SWEEP_PRIORITY = 1;
const DOT = 8;
/** Group header marks: 24dp circles overlapping by 6. */
const AVATAR = 24;
const AVATAR_OVERLAP = 6;

const small = { fontSize: fontSize.caption, lineHeight: lineHeight.caption };

/** Ink of a run tone: the semantic status colors, live in the info ink like `StatusText`. */
export function useRunToneColor() {
  const { colors, semanticColors } = useMobileTheme();
  return (tone: RunTone) => tone === "muted" ? colors.muted : semanticColors[tone === "live" ? "info" : tone].text;
}

/** The run's own provider mark; an unknown provider shows the product mark. */
export function RunMark({ harness, size = 14 }: { harness?: string; size?: number }) {
  return REMOTE_PROVIDERS.includes(harness as RemoteProvider)
    ? <ProviderIcon provider={harness as RemoteProvider} size={size} />
    : <AgentAvatar author={harness} size={size} />;
}

/** Up to three overlapping provider marks, then "+N". Decorative: the header names the count. */
export function RunAvatars({ views }: { views: readonly SubagentRunView[] }) {
  const { colors } = useMobileTheme();
  const { shown, extra } = runAvatars(views);
  const circle = { width: AVATAR, height: AVATAR, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.background,
    backgroundColor: colors.raised, alignItems: "center", justifyContent: "center" } as const;
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", flexShrink: 0 }}>
      {shown.map((item, index) => (
        <View key={item.id} style={[circle, { marginLeft: index ? -AVATAR_OVERLAP : 0, zIndex: shown.length - index }]}>
          <RunMark harness={item.harness} size={14} />
        </View>
      ))}
      {extra ? (
        <View style={[circle, { marginLeft: -AVATAR_OVERLAP }]}>
          <Body muted style={{ fontSize: fontSize.micro, lineHeight: lineHeight.micro, fontVariant: ["tabular-nums"] }}>{`+${extra}`}</Body>
        </View>
      ) : null}
    </View>
  );
}

/**
 * One subagent, flat (no card): a tone dot, the title (sweeping while it runs), `· state` in its
 * tone ink, the trailing elapsed and a chevron; then the run's own provider mark with `model · type`;
 * then at most two lines of what it is doing, what it reported, or its first error line.
 * `action` (an inline Stop) sits beside the row, never inside its button.
 */
export function SubagentRunRow({ view, now, onPress, action, disabled }: {
  view: SubagentRunView;
  now: number;
  onPress?: () => void;
  action?: ReactNode;
  disabled?: boolean;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const toneColor = useRunToneColor()(view.tone);
  const live = isLiveRun(view.state);
  const state = agentStateLabel(view.state, copy);
  const elapsedMs = runElapsedMs(view, now);
  const elapsed = elapsedMs === undefined ? undefined : formatElapsed(elapsedMs);
  const meta = [view.model, view.agentType].filter(Boolean).join(" · ");
  const title = { fontSize: fontSize.control, lineHeight: lineHeight.control, fontWeight: "600" as const };
  // The ticking clock stays out of the spoken label; the state is enough.
  const label = [view.name, state, meta, view.note?.text, view.child ? copy("Oturumu aç", "Open session") : undefined].filter(Boolean).join(". ");
  const inset = DOT + space.sm;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      <PressableCard
        label={label}
        disabled={disabled || !onPress}
        onPress={() => onPress?.()}
        style={{ flex: 1, minWidth: 0, minHeight: metrics.touchTarget, justifyContent: "center", gap: space.xxs, paddingVertical: space.xs, borderRadius: radii.badge }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <View style={{ width: DOT, height: DOT, borderRadius: radii.pill, backgroundColor: toneColor }} />
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            {live
              ? <SweepLabel active priority={SWEEP_PRIORITY} style={title}>{view.name}</SweepLabel>
              : <Body numberOfLines={1} style={title}>{view.name}</Body>}
          </View>
          <Body numberOfLines={1} style={{ ...small, color: toneColor, flexShrink: 0 }}>{`· ${state}`}</Body>
          <View style={{ flex: 1 }} />
          {elapsed ? <Body muted style={{ ...small, fontVariant: ["tabular-nums"], flexShrink: 0 }}>{elapsed}</Body> : null}
          {onPress ? <ChevronRight size={14} color={colors.tertiary} /> : null}
        </View>
        {meta || view.harness ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, paddingLeft: inset }}>
            <RunMark harness={view.harness} size={14} />
            {meta ? <Body muted numberOfLines={1} style={{ ...small, flexShrink: 1 }}>{meta}</Body> : null}
          </View>
        ) : null}
        {view.note ? (
          <Body numberOfLines={2} style={{ ...small, paddingLeft: inset, color: view.note.danger ? colors.danger : colors.muted }}>{view.note.text}</Body>
        ) : null}
      </PressableCard>
      {action}
    </View>
  );
}
