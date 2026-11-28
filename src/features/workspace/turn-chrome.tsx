import { useState } from "react";
import { View } from "react-native";
import ArrowLeftRight from "lucide-react-native/icons/arrow-left-right";
import ChartColumn from "lucide-react-native/icons/chart-column";
import Check from "lucide-react-native/icons/check";
import Square from "lucide-react-native/icons/square";
import type { ModelSwitchMeta } from "../../../../src/features/sessions/model/modelSwitchHistory";
import { Body, Row } from "@/ui/primitives";
import { ChatAction } from "@/ui/chat-controls";
import { useChatTextStyles } from "@/ui/chat-styles";
import { useChatAppearance } from "@/state/chat-appearance";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { providerName } from "./provider-choices";
import { ProviderIcon } from "@/ui/provider-identity";
import type { RemoteProvider } from "@/domain/types";
import { SystemFailureCard } from "./system-failure-card";
import {
  formatMessageTime,
  hasTurnMetrics,
  stoppedTurnLabel,
  turnDurationLabel,
  turnMetricsLines,
  turnReceiptLabel,
} from "./transcript-format";
import type { Block } from "./wire";

type SwitchState = { harness: string; model: string; account?: string };

const describe = (state: SwitchState, withProvider: boolean) =>
  [withProvider ? providerName(state.harness) : "", state.account, state.model].filter(Boolean).join(" · ");

/**
 * Desktop's switch row between turns: a recorded provider, account or model switch, or a turn that
 * simply ran on a different model than the one before it.
 */
export function ModelSwitchDivider({ from, to, count = 1 }: { from: SwitchState; to: SwitchState; count?: number }) {
  const copy = useCopy();
  const { colors, uiStyles } = useMobileTheme();
  const withProvider = from.harness !== to.harness;
  const title = `${describe(from, withProvider)} → ${describe(to, withProvider)}`;
  return (
    <View
      accessible
      accessibilityLabel={copy("{p0} modelinden {p1} modeline geçildi", "Switched from {p0} to {p1}", {
        p0: describe(from, withProvider),
        p1: describe(to, withProvider),
      })}
      style={{ flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: space.xs }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: colors.separator }} />
      <ArrowLeftRight size={13} color={colors.muted} />
      <Body muted numberOfLines={1} style={[uiStyles.caption, { flexShrink: 1 }]}>
        {count > 1 ? `${title} (${count})` : title}
      </Body>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.separator }} />
    </View>
  );
}

/**
 * Desktop's handoff divider: the agent the conversation continued with, as one quiet line between
 * turns. The handoff brief is the receiving agent's input, never transcript content.
 */
export function HandoffDivider({ block }: { block: Block }) {
  const copy = useCopy();
  const { colors, uiStyles } = useMobileTheme();
  const meta = block.handoff;
  if (!meta) return null;
  // A failed switch is one failure notice, not a divider.
  if (meta.status === "failed")
    return <SystemFailureCard id={block.id} text={meta.error || copy("Son tur başarısız oldu", "The last turn failed")} />;
  const to = providerName(meta.to);
  const preparing = meta.status === "preparing";
  const cancelled = meta.status === "cancelled";
  const label = preparing
    ? copy("Devir hazırlanıyor", "Preparing a handoff")
    : cancelled
      ? `${to} · ${copy("İptal edildi", "Cancelled")}`
      : to;
  return (
    <View
      accessible
      accessibilityLabel={
        preparing
          ? copy("{p0} için devir hazırlanıyor", "Preparing a handoff to {p0}", { p0: to })
          : cancelled
            ? `${copy("Devir", "Handoff")} · ${label}`
            : copy("{p0} ile devam edildi", "Continued with {p0}", { p0: to })
      }
      style={{ flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: space.sm }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: colors.separator }} />
      {preparing || cancelled ? null : <ProviderIcon provider={meta.to as RemoteProvider} size={14} />}
      <Body muted numberOfLines={1} style={[uiStyles.caption, { flexShrink: 1 }]}>
        {label}
      </Body>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.separator }} />
    </View>
  );
}

export function ModelSwitchRow({ meta }: { meta: ModelSwitchMeta }) {
  const to = meta.steps.at(-1);
  const from = meta.steps.at(-2);
  if (!to || !from) return null;
  return <ModelSwitchDivider from={from} to={to} count={meta.steps.length - 1} />;
}

/**
 * Desktop's settled turn receipt, one muted line: how it ended, the model, when it finished, and the
 * provider-reported token metrics behind one disclosure. The duration lives on the turn's fold row
 * and repeats here only when no fold row shows it. A turn the owner stopped reads "■ You stopped · 46 s".
 */
export function TurnFooter({ turn, showDuration = true }: { turn: Block; showDuration?: boolean }) {
  const copy = useCopy();
  const locale = useLocale();
  const { colors } = useMobileTheme();
  const typography = useChatTextStyles(useChatAppearance((state) => state.textSize));
  const [metricsOpen, setMetricsOpen] = useState(false);
  const stopped = turn.turnOutcome === "stopped";
  const completedAt =
    turn.startedAt != null && turn.durationMs != null ? turn.startedAt + turn.durationMs : undefined;
  const time = completedAt != null ? formatMessageTime(completedAt, locale, copy) : undefined;
  const label = turnReceiptLabel(turn, showDuration, time, copy);
  // The spoken receipt always says who worked and for how long.
  const spoken = [
    stopped ? stoppedTurnLabel(turn.durationMs, copy) : turnDurationLabel(turn.durationMs, turn.turnModel?.name, copy),
    time,
  ].filter(Boolean).join(", ");
  const metrics = hasTurnMetrics(turn.turnMetrics)
    ? turnMetricsLines(turn.turnMetrics, turn.durationMs, locale, copy)
    : undefined;
  return (
    <View style={{ gap: space.xxs, paddingTop: space.xs }}>
      <Row style={{ flexWrap: "nowrap", gap: space.xs, minHeight: 24 }}>
        <View accessible accessibilityLabel={spoken} style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexShrink: 1 }}>
          {stopped ? (
            <Square size={9} color={colors.muted} fill={colors.muted} strokeWidth={0} />
          ) : (
            <Check size={13} color={colors.muted} />
          )}
          <Body muted style={[typography.metadata, { flexShrink: 1, fontVariant: ["tabular-nums"] }]}>
            {label}
          </Body>
        </View>
        {metrics ? (
          <ChatAction
            label={metricsOpen ? copy("Tur ölçümlerini gizle", "Hide turn metrics") : copy("Tur ölçümleri", "Turn metrics")}
            onPress={() => setMetricsOpen((open) => !open)}
          >
            <ChartColumn size={14} color={metricsOpen ? colors.text : colors.subtle} />
          </ChatAction>
        ) : null}
      </Row>
      {metrics && metricsOpen ? (
        <View style={{ paddingStart: 13 + space.xs }}>
          <Body style={typography.metadata}>{metrics.headline}</Body>
          {metrics.detail ? <Body muted style={typography.metadata}>{metrics.detail}</Body> : null}
        </View>
      ) : null}
    </View>
  );
}
