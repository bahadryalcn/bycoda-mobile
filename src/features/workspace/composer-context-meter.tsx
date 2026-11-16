import { useState } from "react";
import { View } from "react-native";
import { RingChart } from "panelui-native/components/ring-chart";
import { ChatToolbarAction } from "@/ui/chat-controls";
import { Body, FormActions, Notice, Sheet, Stack, StatusRow } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import {
  contextTokensLabel,
  contextTone,
  formatContextCost,
  type ComposerContextReading,
} from "./composer-context";

const RING = 20;
const STROKE = 2.5;

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
        onPress={() => setOpen(true)}
      >
        <ContextRing ratio={reading.ratio ?? 0} tone={tone} />
      </ChatToolbarAction>
      <Sheet visible={open} title={title} size="compact" onClose={() => setOpen(false)}>
        <Stack>
          <StatusRow label={title}>
            <Body
              style={{
                fontWeight: "600",
                color: tone === "normal" ? undefined : semanticColors[tone].text,
              }}
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
        {onCompact ? (
          <FormActions
            submitLabel={copy("Şimdi sıkıştır", "Compact now")}
            disabled={compactDisabled}
            onSubmit={() => {
              setOpen(false);
              onCompact();
            }}
            onCancel={() => setOpen(false)}
            cancelLabel={copy("Kapat", "Close")}
          />
        ) : null}
      </Sheet>
    </>
  );
}

function ContextRing({ ratio, tone }: { ratio: number; tone: ReturnType<typeof contextTone> }) {
  const { colors, semanticColors } = useMobileTheme();
  const color = tone === "normal" ? colors.muted : semanticColors[tone].text;
  // Decorative: the toolbar action carries the accessible percent, and touches go to it.
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <RingChart
        size={RING}
        strokeWidth={STROKE}
        data={[{ label: "", value: Math.max(0, Math.min(1, ratio)), maxValue: 1, color }]}
      >
        <RingChart.Ring index={0} color={color} />
      </RingChart>
    </View>
  );
}
