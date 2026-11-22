import { useState } from "react";
import { View } from "react-native";
import Zap from "lucide-react-native/icons/zap";
import { RingChart } from "panelui-native/components/ring-chart";
import { ChatToolbarAction } from "@/ui/chat-controls";
import { Body, Button, Notice, Sheet, Stack, StatusRow } from "@/ui/primitives";
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

/**
 * Composer context ring, the phone counterpart of the desktop `ContextMeter`: the ring shows how
 * full the context window is; tapping it opens the usage details and Compact now.
 */
export function ComposerContextMeter({
  reading,
  compactDisabled,
  onCompact,
}: {
  reading: ComposerContextReading;
  /** A run or send is in progress; compaction waits for it. */
  compactDisabled: boolean;
  onCompact?: () => void;
}) {
  const copy = useCopy();
  const { semanticColors } = useMobileTheme();
  const [open, setOpen] = useState(false);
  const title = copy("Bağlam kullanımı", "Context usage");
  const percent =
    reading.ratio === null ? copy("Bilinmiyor", "Unknown") : `${Math.round(reading.ratio * 100)}%`;
  const tokens = reading.empty
    ? copy("Henüz bağlam kullanılmadı", "No context used yet")
    : `${contextTokensLabel(reading)} ${copy("token", "tokens")}`;
  const tone = contextTone(reading.ratio);
  return (
    <>
      <ChatToolbarAction
        label={title}
        accessibilityLabel={`${title}: ${percent}. ${tokens}`}
        hideLabel
        reserveTouchTarget
        onPress={() => setOpen(true)}
      >
        <ContextRing ratio={reading.ratio ?? 0} tone={tone} tps={reading.tps} bolt={!reading.empty} />
      </ChatToolbarAction>
      <Sheet
        visible={open}
        title={title}
        size="compact"
        onClose={() => setOpen(false)}
        footer={onCompact ? (
          <Button
            label={copy("Şimdi sıkıştır", "Compact now")}
            tone="primary"
            fullWidth
            reserveTouchTarget
            disabled={compactDisabled}
            onPress={() => {
              setOpen(false);
              onCompact();
            }}
          />
        ) : undefined}
      >
        <Stack>
          <StatusRow label={copy("Dolu", "Used")}>
            <Body
              // A `color: undefined` entry overrides the themed text color (dark text on the dark sheet).
              style={tone === "normal" ? { fontWeight: "600" } : { fontWeight: "600", color: semanticColors[tone].text }}
            >
              {percent}
            </Body>
          </StatusRow>
          <Body muted selectable>
            {tokens}
          </Body>
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
          {onCompact && compactDisabled ? (
            <Notice
              tone="info"
              message={copy(
                "Geçerli işlemin bitmesini bekleyin",
                "Wait for the current operation to finish",
              )}
            />
          ) : null}
        </Stack>
      </Sheet>
    </>
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
