import { useState } from "react";
import { View } from "react-native";
import ArrowLeftRight from "lucide-react-native/icons/arrow-left-right";
import ChartColumn from "lucide-react-native/icons/chart-column";
import Check from "lucide-react-native/icons/check";
import X from "lucide-react-native/icons/x";
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
import { formatMessageTime, hasTurnMetrics, turnDurationLabel, turnMetricsLines } from "./transcript-format";
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

export function ModelSwitchRow({ meta }: { meta: ModelSwitchMeta }) {
  const to = meta.steps.at(-1);
  const from = meta.steps.at(-2);
  if (!to || !from) return null;
  return <ModelSwitchDivider from={from} to={to} count={meta.steps.length - 1} />;
}

/**
 * Desktop's settled turn receipt: how it ended, who worked and for how long, when it finished, and
 * the provider-reported token metrics behind one disclosure.
 */
export function TurnFooter({ turn }: { turn: Block }) {
  const copy = useCopy();
  const locale = useLocale();
  const { colors } = useMobileTheme();
  const typography = useChatTextStyles(useChatAppearance((state) => state.textSize));
  const [metricsOpen, setMetricsOpen] = useState(false);
  const label = turnDurationLabel(turn.durationMs, turn.turnModel?.name, copy);
  const completedAt =
    turn.startedAt != null && turn.durationMs != null ? turn.startedAt + turn.durationMs : undefined;
  const metrics = hasTurnMetrics(turn.turnMetrics)
    ? turnMetricsLines(turn.turnMetrics, turn.durationMs, locale, copy)
    : undefined;
  const Icon = turn.turnOutcome === "stopped" ? X : Check;
  return (
    <View style={{ gap: space.xxs, paddingTop: space.xs }}>
      <Row style={{ flexWrap: "nowrap", gap: space.xs, minHeight: 24 }}>
        <Icon size={13} color={colors.muted} />
        <Body muted numberOfLines={1} style={[typography.metadata, { flexShrink: 1 }]}>
          {completedAt != null ? `${label} · ${formatMessageTime(completedAt, locale, copy)}` : label}
        </Body>
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
