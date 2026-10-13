import React, { createContext, useContext, useRef, type ReactElement } from "react";
import {
  View,
  FlatList,
  type ViewProps,
  type FlatListProps,
  type ListRenderItem,
} from "react-native";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import Download from "lucide-react-native/icons/download";
import type { UIMessage } from "ai";
import { Message, MessageContent, MessageResponse } from "./message";
import { Body } from "../../typography";
import { IconButton } from "../../buttons";
import { colors } from "../../tokens";
type ScrollContext = { scrollToLatest: () => void };
const Scroll = createContext<ScrollContext | null>(null);
export type ConversationProps = ViewProps & { className?: string; ref?: React.Ref<View> };
export function Conversation({ className = "", ...props }: ConversationProps) {
  return <View {...props} className={"flex-1 min-h-0 bg-background " + className} />;
}
export type ConversationEmptyStateProps = {
  title?: string;
  description?: string;
  icon?: ReactElement;
  className?: string;
};
export function ConversationEmptyState({
  title = "Start a conversation",
  description = "Type a message to begin",
  icon,
  className = "",
}: ConversationEmptyStateProps) {
  return (
    <View className={"flex-1 items-center justify-center gap-ui-sm p-ui-screen " + className}>
      {icon}
      <Body>{title}</Body>
      <Body muted>{description}</Body>
    </View>
  );
}
export type ConversationContentProps = Omit<FlatListProps<UIMessage>, "data" | "renderItem"> & {
  messages: UIMessage[];
  renderItem?: ListRenderItem<UIMessage>;
  estimatedItemSize?: number;
};
export function ConversationContent({
  messages,
  renderItem,
  estimatedItemSize: _estimate,
  ...props
}: ConversationContentProps) {
  const ref = useRef<FlatList<UIMessage>>(null);
  const defaultRender: ListRenderItem<UIMessage> = ({ item, index }) => (
    <Message role={item.role} message={item} index={index}>
      <MessageContent>
        <MessageResponse message={item} />
      </MessageContent>
    </Message>
  );
  const scrollToLatest = () => {
    if (props.inverted) ref.current?.scrollToOffset({ offset: 0, animated: true });
    else ref.current?.scrollToEnd({ animated: true });
  };
  return (
    <Scroll.Provider value={{ scrollToLatest }}>
      <FlatList
        {...props}
        ref={ref}
        data={messages}
        renderItem={renderItem ?? defaultRender}
        keyExtractor={props.keyExtractor ?? ((item) => item.id)}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={props.ListEmptyComponent ?? ConversationEmptyState}
      />
    </Scroll.Provider>
  );
}
export function ConversationScrollButton({ onPress }: { onPress?: () => void }) {
  const context = useContext(Scroll);
  return (
    <IconButton
      label="Latest message"
      disabled={!onPress && !context}
      onPress={() => {
        if (onPress) onPress();
        else context?.scrollToLatest();
      }}
    >
      <ArrowDown size={18} color={colors.muted} />
    </IconButton>
  );
}
/** Export is explicit: callers supply the authorized storage/share destination. */
export type ConversationDownloadProps = {
  messages: UIMessage[];
  onExport?: (messages: UIMessage[]) => void;
};
export function ConversationDownload({ messages, onExport }: ConversationDownloadProps) {
  return (
    <IconButton
      label="Export conversation"
      disabled={!onExport}
      onPress={() => onExport?.(messages)}
    >
      <Download size={18} color={colors.muted} />
    </IconButton>
  );
}
