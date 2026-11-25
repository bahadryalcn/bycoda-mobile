import { View } from "react-native";
import Zap from "lucide-react-native/icons/zap";
import { RingChart } from "panelui-native/components/ring-chart";
import { ChatToolbarAction } from "@/ui/chat-controls";
import { Body, Button, Disclosure, Stack, StatusRow } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import {
  contextTokensLabel,
  contextTone,
  formatContextApiTime,
  formatContextCost,
  type ComposerContextReading,
} from "./composer-context";

const RING = 22;
const STROKE = 2;
const BOLT = 11;

/** The ring joins the composer toolbar only when the context window needs attention. */
export function contextNeedsAttention(reading: ComposerContextReading | null | undefined): boolean {
  return !!reading && contextTone(reading.ratio) !== "normal";
}

/**
 * Composer context ring, the phone counterpart of the desktop `ContextMeter`. It is shown in the
 * toolbar only in warning or danger tone and opens the model sheet, which holds the reading and
 * Compact now.
 */
export function ComposerContextRing({
  reading,
  onPress,
}: {
  reading: ComposerContextReading;
  onPress: () => void;
}) {
  const copy = useCopy();
  const title = copy("Bağlam kullanımı", "Context usage");
  const { percent, tokens } = contextText(reading, copy);
  return (
    <ChatToolbarAction
      label={title}
      accessibilityLabel={`${title}: ${percent}. ${tokens}`}
      hideLabel
      reserveTouchTarget
      onPress={onPress}
    >
      <ContextRing ratio={reading.ratio ?? 0} tone={contextTone(reading.ratio)} tps={reading.tps} bolt={!reading.empty} />
    </ChatToolbarAction>
  );
}

function contextText(reading: ComposerContextReading, copy: ReturnType<typeof useCopy>) {
  return {
    percent: reading.ratio === null ? copy("Bilinmiyor", "Unknown") : `${Math.round(reading.ratio * 100)}%`,
    tokens: reading.empty
      ? copy("Henüz bağlam kullanılmadı", "No context used yet")
      : `${contextTokensLabel(reading)} ${copy("token", "tokens")}`,
  };
}

/**
 * The context reading inside the model sheet: one summary row, usage details behind a disclosure,
 * and Compact now. Compaction is a command of its own, not part of the sheet's draft.
 */
export function ComposerContextSection({
  reading,
  compactDisabled,
  compactReason,
  onCompact,
}: {
  reading: ComposerContextReading;
  /** A run, send or unsaved choice is in progress; compaction waits for it. */
  compactDisabled: boolean;
  compactReason?: string;
  onCompact?: () => void;
}) {
  const copy = useCopy();
  const { semanticColors } = useMobileTheme();
  const { percent, tokens } = contextText(reading, copy);
  const tone = contextTone(reading.ratio);
  const details = reading.costUsd !== undefined || !reading.empty || !!reading.agents?.length || reading.apiMs !== undefined;
  return (
    <Stack>
      <StatusRow label={copy("Bağlam", "Context")}>
        <Body
          selectable
          // A `color: undefined` entry overrides the themed text color (dark text on the dark sheet).
          style={tone === "normal" ? { fontWeight: "600" } : { fontWeight: "600", color: semanticColors[tone].text }}
        >
          {percent}
        </Body>
      </StatusRow>
      <Body muted selectable>{tokens}</Body>
      {details ? (
        <Disclosure label={copy("Kullanım ayrıntıları", "Usage details")}>
          <Stack>
            {reading.costUsd !== undefined ? (
              <StatusRow label={copy("Maliyet", "Cost")}>
                <Body selectable>{formatContextCost(reading.costUsd)}</Body>
              </StatusRow>
            ) : null}
            {reading.empty ? null : (
              <StatusRow label={copy("Yanıt hızı", "Response speed")}>
                <Body selectable>
                  {reading.tps === undefined ? copy("Yok", "Unavailable") : `${reading.tps.toFixed(1)} TPS`}
                </Body>
              </StatusRow>
            )}
            {reading.agents?.length ? (
              <>
                <Body style={{ fontWeight: "600" }}>
                  {copy("Alt ajanlar", "Subagents")} · {reading.agents.length}
                </Body>
                {reading.agents.map((agent) => (
                  <StatusRow key={agent.id} label={agent.name}>
                    <Body
                      selectable
                      style={contextTone(agent.ratio) === "normal"
                        ? undefined
                        : { color: semanticColors[contextTone(agent.ratio) as "warning" | "danger"].text }}
                    >
                      {agent.used === undefined
                        ? copy("Yok", "Unavailable")
                        : `${agent.ratio !== null ? `${Math.round(agent.ratio * 100)}% · ` : ""}${contextTokensLabel({ ratio: agent.ratio, used: agent.used, window: agent.window, empty: false })}`}
                    </Body>
                  </StatusRow>
                ))}
              </>
            ) : null}
            {reading.apiMs !== undefined ? (
              <StatusRow label={copy("API süresi", "API time")}>
                <Body selectable>{formatContextApiTime(reading.apiMs)}</Body>
              </StatusRow>
            ) : null}
          </Stack>
        </Disclosure>
      ) : null}
      {onCompact ? (
        <Button
          label={copy("Şimdi sıkıştır", "Compact now")}
          tone="secondary"
          reserveTouchTarget
          disabled={compactDisabled}
          onPress={onCompact}
        />
      ) : null}
      {onCompact && compactDisabled && compactReason ? <Body muted>{compactReason}</Body> : null}
    </Stack>
  );
}

/** Desktop `responseSpeedFill`: bands of the completed turn average TPS; no reading, no fill. */
function speedFill(tps: number | undefined): number {
  if (tps === undefined || !Number.isFinite(tps) || tps <= 0) return 0;
  return tps < 10 ? 0.25 : tps < 30 ? 0.5 : tps < 60 ? 0.75 : 1;
}

function ContextRing({
  ratio,
  tone,
  tps,
  bolt,
}: {
  ratio: number;
  tone: ReturnType<typeof contextTone>;
  tps?: number;
  bolt: boolean;
}) {
  const { colors, semanticColors } = useMobileTheme();
  const color = tone === "normal" ? colors.muted : semanticColors[tone].text;
  // Decorative: the toolbar action carries the accessible percent, and touches go to it.
  // The track stays neutral at every tone (desktop `ringTrack`), so it is its own full ring.
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ width: RING, height: RING }}
    >
      <View style={{ position: "absolute", opacity: 0.18 }}>
        <RingChart
          size={RING}
          strokeWidth={STROKE}
          data={[{ label: "", value: 1, maxValue: 1, color: colors.muted }]}
        >
          <RingChart.Ring index={0} color={colors.muted} trackOpacity={0} />
        </RingChart>
      </View>
      <View style={{ position: "absolute", opacity: ratio > 0 ? 1 : 0 }}>
        <RingChart
          size={RING}
          strokeWidth={STROKE}
          data={[{ label: "", value: Math.max(0, Math.min(1, ratio)), maxValue: 1, color }]}
        >
          <RingChart.Ring index={0} color={color} trackOpacity={0} />
        </RingChart>
      </View>
      {bolt ? <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
        <Zap size={BOLT} strokeWidth={1.5} color={colors.subtle} />
        {speedFill(tps) > 0 ? (
          <View style={{ position: "absolute", bottom: (RING - BOLT) / 2, height: BOLT * speedFill(tps), overflow: "hidden", justifyContent: "flex-end" }}>
            <Zap size={BOLT} strokeWidth={1.5} color={colors.muted} fill={colors.muted} />
          </View>
        ) : null}
      </View> : null}
    </View>
  );
}
