import { useMobileTheme } from "@/ui/theme";
import { useState } from "react";
import Animated from "react-native-reanimated";
import { Body, Stack, Skeleton, Notice, Section, SegmentedControl } from "@/ui/primitives";
import { enterItem } from "@/ui/motion";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { useChatTextStyles } from "@/ui/chat-styles";

import { useChatAppearance } from "@/state/chat-appearance";
import { ChatMessage, ChatResponse, chatUserBubbleStyle } from "@/ui/chat";
import type { UIMessage } from "ai";
import { chatTextSizeOptions } from "./chat-appearance-options";
import { chatAppearanceFeedback } from "./chat-appearance-feedback";
import { useAsyncAction } from "@/state/actions";

export function ChatAppearanceSettings() {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const size = useChatAppearance((state) => state.textSize);
  const hydrated = useChatAppearance((state) => state.hydrated);
  const setTextSize = useChatAppearance((state) => state.setTextSize);
  const storageError = useChatAppearance((state) => state.storageError);
  const retryStorage = useChatAppearance((state) => state.retryStorage);
  const retry = useAsyncAction();
  const [retryError, setRetryError] = useState<Error | null>(null);
  const retrying = retryError !== null;
  const feedback = chatAppearanceFeedback(storageError ?? retryError, copy);
  const text = useChatTextStyles(size);
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
          hideLabel
          value={size}
          disabled={!hydrated || retrying}
          options={chatTextSizeOptions(copy)}
          onChange={(value) => {
            void setTextSize(value);
          }}
        />
      </Section>
      {!hydrated ? <Skeleton /> : null}
      {feedback ? (
        <Notice
          tone="warning"
          message={feedback.message}
          retrying={retrying}
          onRetry={feedback.retryable && (storageError ?? retryError) ? () => {
            const expectedError = storageError ?? retryError;
            if (!expectedError || retrying) return;
            setRetryError(expectedError);
            void retry.run(() => retryStorage(expectedError)).finally(() => setRetryError(null));
          } : undefined}
        />
      ) : null}
      <Section title={copy("Önizleme", "Preview")}>
        <Stack style={{ gap: space.lg, paddingBottom: space.lg }}>
          <ChatMessage
            role="user"
            message={messages[0]}
            style={{ ...chatUserBubbleStyle(colors), gap: space.xs }}
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
