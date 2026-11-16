import type { UIMessage } from "ai";
import { Badge, Body, Card, Heading, Section, Stack } from "@/ui/primitives";
import { ChatMessage, ChatResponse, chatUserBubbleStyle } from "@/ui/chat";
import { useChatTextStyles } from "@/ui/chat-styles";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { useChatAppearance } from "@/state/chat-appearance";

/**
 * Representative preview built from the real shared owners: Heading/Body/Badge follow the
 * theme, palette and general typography, and the chat messages follow the message text size.
 * It shows the committed preferences, not a native-device or installed-font guarantee.
 */
export function AppearancePreview() {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const size = useChatAppearance((state) => state.textSize);
  const text = useChatTextStyles(size);
  const messages = [
    {
      id: "appearance-preview-user",
      role: "user",
      parts: [
        {
          type: "text",
          text: copy("Bu projedeki değişiklikleri özetle.", "Summarize the changes in this project."),
        },
      ],
    },
    {
      id: "appearance-preview-assistant",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: [
            copy(
              "Değişiklikleri inceledim. Dosya listesi ve sonraki adımlar aşağıda.",
              "I reviewed the changes. The file list and next steps are below.",
            ),
            "",
            "`session.status`",
            "",
            "```typescript",
            "const status = 'ready';",
            "```",
          ].join("\n"),
        },
      ],
    },
  ] satisfies UIMessage[];
  return (
    <Section title={copy("Önizleme", "Preview")}>
      <Stack style={{ gap: space.lg, paddingBottom: space.lg }}>
        <Card variant="surface">
          <Heading>{copy("Oturum özeti", "Session summary")}</Heading>
          <Body>
            {copy(
              "Üç dosya değişti ve testler geçti. İncelemeye hazır.",
              "Three files changed and the tests passed. Ready for review.",
            )}
          </Body>
          <Body muted>{copy("2 dakika önce güncellendi", "Updated 2 minutes ago")}</Body>
          <Badge label={copy("Hazır", "Ready")} />
        </Card>
        <ChatMessage
          role="user"
          message={messages[0]}
          style={{ ...chatUserBubbleStyle(colors), gap: space.xs }}
        >
          <Body style={[text.author, { color: colors.muted }]}>{copy("Sen", "You")}</Body>
          <ChatResponse message={messages[0]} />
        </ChatMessage>
        <ChatMessage role="assistant" message={messages[1]} style={{ gap: space.xs }}>
          <Body style={[text.author, { color: colors.muted }]}>{copy("Asistan", "Assistant")}</Body>
          <ChatResponse message={messages[1]} />
        </ChatMessage>
      </Stack>
    </Section>
  );
}
