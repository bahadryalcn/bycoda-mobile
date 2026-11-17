import { useState } from "react";
import { Stack, Skeleton, Notice, Section, SegmentedControl } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";

import { useChatAppearance } from "@/state/chat-appearance";
import { chatTextSizeOptions } from "./chat-appearance-options";
import { chatAppearanceFeedback } from "./chat-appearance-feedback";
import { useAsyncAction } from "@/state/actions";
import { ChatDisplaySettings } from "./chat-appearance-display";

/** Message text size with its read/save recovery; the Appearance page owns the preview below it. */
export function ChatAppearanceSettings() {
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
  return (
    <Stack style={{ gap: space.lg }}>
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
      <ChatDisplaySettings />
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
    </Stack>
  );
}
