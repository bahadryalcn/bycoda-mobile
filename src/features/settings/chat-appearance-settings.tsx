import { useMobileTheme } from "@/ui/theme";
import Animated from "react-native-reanimated";
import { Body, Stack, Notice, Section, SegmentedControl } from "@/ui/primitives";
import { enterItem } from "@/ui/motion";
import { useCopy } from "@/ui/copy";
import { colors, space } from "@/ui/tokens";
import { chatTextStyles } from "@/ui/chat-styles";

import { useChatAppearance } from "@/state/chat-appearance";
import { ChatMessage, ChatResponse, chatUserBubbleStyle } from "@/ui/chat";
import type { UIMessage } from "ai";

export function ChatAppearanceSettings() {
  useMobileTheme();
  const copy = useCopy();
  const size = useChatAppearance((state) => state.textSize);
  const hydrated = useChatAppearance((state) => state.hydrated);
  const setTextSize = useChatAppearance((state) => state.setTextSize);
  const storageError = useChatAppearance((state) => state.storageError);
  const text = chatTextStyles(size);
  const messages = [
    {
      id: "appearance-preview-user",
      role: "user",
      parts: [
        {
          type: "text",
          text: copy(
            "Bu projedeki değişiklikleri özetle.",
            "Summarize the changes in this project.",
          ),
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
            "",
            "[Markdown](https://commonmark.org/help/)",
          ].join("\n"),
        },
      ],
    },
  ] satisfies UIMessage[];
  return (
    <Animated.View entering={enterItem(0)} style={{ gap: space.lg }}>
      <Section title={copy("Mesaj yazı boyutu", "Message text size")}>
        <SegmentedControl
          label={copy("Mesaj yazı boyutu", "Message text size")}
          value={size}
          disabled={!hydrated}
          options={[
            { value: "compact", label: copy("Küçük", "Small") },
            { value: "standard", label: copy("Normal", "Standard") },
            { value: "large", label: copy("Büyük", "Large") },
          ]}
          onChange={(value) => {
            void setTextSize(value);
          }}
        />
      </Section>
      {storageError ? (
        <Notice
          tone="warning"
          message={copy(
            "Yazı boyutu değişti, ancak tercih bu telefona kaydedilemedi. Yeniden seçerek dene.",
            "Text size changed, but the preference could not be saved on this phone. Select it again to retry.",
          )}
        />
      ) : null}
      <Section title={copy("Önizleme", "Preview")}>
        <Stack style={{ gap: space.lg }}>
          <ChatMessage
            role="user"
            message={messages[0]}
            style={{ ...chatUserBubbleStyle(), gap: space.xs }}
          >
            <Body style={[text.author, { color: colors.muted }]}>{copy("Sen", "You")}</Body>
            <ChatResponse message={messages[0]} />
          </ChatMessage>
          <ChatMessage role="assistant" message={messages[1]} style={{ gap: space.xs }}>
            <Body style={[text.author, { color: colors.muted }]}>
              {copy("Asistan", "Assistant")}
            </Body>
            <ChatResponse message={messages[1]} />
          </ChatMessage>
        </Stack>
      </Section>
    </Animated.View>
  );
}
