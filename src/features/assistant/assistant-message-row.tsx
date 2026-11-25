import { View } from "react-native";
import { MessageText } from "@/ui/message-text";
import { Body } from "@/ui/primitives";
import { chatUserBubbleStyle } from "@/ui/chat";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import type { AssistantMessage } from "../../../../src/shared/model/host-contracts/assistant";

/** Messaging layout: the owner's messages sit in a trailing bubble, the assistant's lead on the left. */
export function AssistantMessageRow({
  message,
  voiceLabel,
}: {
  message: AssistantMessage;
  voiceLabel: string;
}) {
  const { colors, uiStyles } = useMobileTheme();
  const owner = message.role === "user";
  return (
    <View
      style={
        owner
          ? chatUserBubbleStyle(colors)
          : { alignSelf: "flex-start", maxWidth: "92%", paddingVertical: space.xs }
      }
    >
      <MessageText text={message.text} role={owner ? "user" : "assistant"} compactMedia />
      {message.via === "voice" ? <Body muted style={uiStyles.caption}>{voiceLabel}</Body> : null}
    </View>
  );
}
