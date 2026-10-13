import React from "react";
import { View, type ViewProps } from "react-native";
import { Message, MessageContent } from "./message";
import { MessageText } from "../../message-text";
import type { ChatMessage as ChatMessageType } from "./types";
type Props = ViewProps & { message: ChatMessageType; textClassName?: string };
export const ChatMessage = React.forwardRef<View, Props>(function ChatMessage(
  { message, textClassName: _textClass, ...props },
  ref,
) {
  return (
    <Message {...props} ref={ref} role={message.role}>
      <MessageContent>
        <MessageText text={message.content} role={message.role} compactMedia />
      </MessageContent>
    </Message>
  );
});
