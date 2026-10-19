import React from "react";
import Animated from "react-native-reanimated";
import { View, type ViewProps } from "react-native";
import { Message } from "panelui-native/components/message";
import { Surface } from "panelui-native/components/surface";
import type { UIMessage } from "ai";
import type { MessageContext } from "./media-policy";
import { MessageText } from "./message-text";
import { colors, radii, space } from "./tokens";

/** Product facade keeps transcript semantics while PanelUI owns presentation. */
export const ChatMessage = React.memo(function ChatMessage({
  role,
  message: _message,
  style,
  ...props
}: Omit<ViewProps, "role"> & { role: UIMessage["role"]; message?: UIMessage; className?: string }) {
  return (
    <Message
      {...props}
      align={role === "user" ? "end" : "start"}
      style={[{ flexDirection: "column", alignItems: "stretch", width: role === "user" ? "auto" : "100%" }, style]}
    />
  );
});

export const ChatMessageContent = Message.Content;
export function ChatResponse({
  message,
  context,
}: {
  message: UIMessage;
  context?: MessageContext;
}) {
  return (
    <MessageText
      text={message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n\n")}
      role={message.role === "user" ? "user" : "assistant"}
      context={context}
      compactMedia
    />
  );
}

export const ChatConversation = React.forwardRef<View, ViewProps>(
  function ChatConversation(props, ref) {
    // The application already owns inversion, history anchoring and keyboard space.
    return <Surface {...props} variant="transparent" padding="none" ref={ref} />;
  },
);

/**
 * Plain capsule row for the composer: the owning feature supplies the leading action,
 * field and trailing action, so drafts, uploads and dispatch stay in one place.
 * PanelUI's AIInput is deliberately not used here because it injects its own toolbar chrome.
 */
export const ChatComposerSurface = Animated.View;

/** The user's own message: a rounded trailing bubble that never spans the whole column. */
export function chatUserBubbleStyle() {
  return {
    alignSelf: "flex-end" as const,
    maxWidth: "85%" as const,
    backgroundColor: colors.userMessage,
    borderRadius: radii.card,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  };
}
