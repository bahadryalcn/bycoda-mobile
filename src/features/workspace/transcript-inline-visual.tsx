import { useState } from "react";
import { View } from "react-native";
import ChartColumn from "lucide-react-native/icons/chart-column";
import { Body, Button, QueryState, Row, Sheet } from "@/ui/primitives";
import { HtmlPreview } from "@/ui/html-preview";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { useChatTextStyles } from "@/ui/chat-styles";
import { useChatAppearance } from "@/state/chat-appearance";
import { useActiveMachine } from "@/state/machines";
import { space } from "@/ui/tokens";
import { useInlineVisualSource } from "./session-queries";
import type { SessionScope } from "./session-types";
import {
  inlineVisualDocument,
  inlineVisualFrameHeight,
  inlineVisualPresentation,
  inlineVisualTheme,
} from "./inline-visual-model";

/**
 * A visual the agent drew (desktop `InlineVisual`): its title, then the self-contained source in the
 * shared sandboxed preview at its declared height, bounded for the transcript, with a full-screen
 * reader. A computer that cannot serve the source leaves the titled row and says where to open it.
 */
export function TranscriptInlineVisual({ visual, scope }: { visual: unknown; scope: SessionScope }) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const { colors, mode } = useMobileTheme();
  const typography = useChatTextStyles(useChatAppearance((state) => state.textSize));
  const capabilities = machine?.id === scope.machineId ? machine.capabilities : undefined;
  const presentation = inlineVisualPresentation(visual, capabilities);
  const stored = useInlineVisualSource(scope, presentation.kind === "stored" ? presentation.id : undefined);
  const [full, setFull] = useState(false);
  const source = presentation.kind === "snapshot" ? presentation : presentation.kind === "stored" ? stored.data : undefined;
  const title = presentation.title || copy("Görsel", "Visual");
  const document = source ? inlineVisualDocument(source.html, mode === "dark", inlineVisualTheme(colors)) : undefined;
  return (
    <View style={{ gap: space.xs }} accessibilityLabel={title}>
      <Row style={{ flexWrap: "nowrap", gap: space.sm, minHeight: 24 }}>
        <ChartColumn size={16} color={colors.muted} />
        <Body numberOfLines={3} style={[typography.author, { flex: 1, minWidth: 0, color: colors.muted }]}>
          {title}
        </Body>
      </Row>
      {document && source ? (
        <>
          <HtmlPreview html={document} height={inlineVisualFrameHeight(source.height)} />
          <Button
            label={copy("Tam ekran aç", "Open full screen")}
            density="compact"
            tone="quiet"
            style={{ alignSelf: "flex-start" }}
            onPress={() => setFull(true)}
          />
          <Sheet visible={full} title={title} size="full" scroll={false} onClose={() => setFull(false)}>
            {full ? <HtmlPreview html={document} fill /> : null}
          </Sheet>
        </>
      ) : presentation.kind === "stored" ? (
        <QueryState query={stored} loading="inline" compact />
      ) : (
        <Body muted style={typography.metadata}>
          {copy("Bu görseli bilgisayarında aç", "Open this visual on your computer")}
        </Body>
      )}
    </View>
  );
}
