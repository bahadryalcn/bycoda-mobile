import React from "react";
import Animated from "react-native-reanimated";
import { View } from "react-native";
import { PromptInput, type PromptInputProps } from "./gluestack/chat-ai/prompt-input";
export {
  Message as ChatMessage,
  MessageContent as ChatMessageContent,
  MessageResponse as ChatResponse,
} from "./gluestack/chat-ai/message";
export { Conversation as ChatConversation } from "./gluestack/chat-ai/conversation";
const ComposerFrame = React.forwardRef<View, PromptInputProps>(function ComposerFrame(props, ref) {
  return <PromptInput {...props} managed ref={ref} />;
});
/** Animated surface, while the owning composer retains its persisted draft and transport. */
export const ChatComposerSurface = Animated.createAnimatedComponent(ComposerFrame);
