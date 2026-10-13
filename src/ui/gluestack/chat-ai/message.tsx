import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { View, Text, type ViewProps } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import type { UIMessage } from "ai";
import { MessageText } from "../../message-text";
import { IconButton } from "../../buttons";
import { colors } from "../../tokens";
import type { MessageContext as PreviewContext } from "../../media-policy";

type MessageContextType = { role: UIMessage["role"]; message?: UIMessage };
const Context = createContext<MessageContextType | null>(null);
function useMessage() {
  const value = useContext(Context);
  if (!value) throw new Error("Message children require Message");
  return value;
}
export type MessageProps = Omit<ViewProps, "role"> & {
  ref?: React.Ref<View>;
  role: UIMessage["role"];
  message?: UIMessage;
  index?: number;
  className?: string;
};
/** Presentation only. The owning transcript controls anchoring, keyboard space and delivery. */
export const Message = React.memo(function Message({
  role,
  message,
  index: _index,
  className = "",
  ...props
}: MessageProps) {
  const context = useMemo(() => ({ role, message }), [role, message]);
  return (
    <Context.Provider value={context}>
      <View {...props} className={"min-w-0 gap-ui-xs " + className} />
    </Context.Provider>
  );
});
export type MessageContentProps = ViewProps & { className?: string };
export const MessageContent = React.memo(function MessageContent({
  className = "",
  ...props
}: MessageContentProps) {
  const { role } = useMessage();
  return (
    <View
      {...props}
      className={
        (role === "user"
          ? "self-end rounded-card bg-user-message px-ui-md py-ui-sm "
          : "self-stretch bg-transparent ") +
        "min-w-0 gap-ui-xs " +
        className
      }
    />
  );
});
export const MessageResponse = React.memo(function MessageResponse({
  message,
  context,
}: {
  message: UIMessage;
  context?: PreviewContext;
}) {
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n\n");
  return (
    <MessageText
      text={text}
      role={message.role === "user" ? "user" : "assistant"}
      context={context}
      compactMedia
    />
  );
});
export type MessageToolbarProps = ViewProps & { className?: string; message?: UIMessage };
export function MessageToolbar({
  className = "",
  message: _message,
  ...props
}: MessageToolbarProps) {
  const { role } = useMessage();
  if (role === "user") return null;
  return <View {...props} className={"flex-row items-center gap-ui-xs " + className} />;
}
export function MessageAction({
  onPress,
  tooltip,
  label,
  children,
  disabled,
}: {
  onPress?: () => void;
  tooltip?: string;
  label?: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <IconButton
      label={label ?? tooltip ?? "Message action"}
      onPress={() => onPress?.()}
      disabled={disabled || !onPress}
    >
      {children}
    </IconButton>
  );
}
type BranchContext = {
  current: number;
  branches: React.ReactNode[];
  setBranches: (children: React.ReactNode[]) => void;
  select: (index: number) => void;
};
const Branch = createContext<BranchContext | null>(null);
function useBranch() {
  const value = useContext(Branch);
  if (!value) throw new Error("Branch controls require MessageBranch");
  return value;
}
export function MessageBranch({
  defaultBranch = 0,
  onBranchChange,
  children,
  className = "",
}: {
  defaultBranch?: number;
  onBranchChange?: (index: number) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [current, setCurrent] = useState(Math.max(0, defaultBranch));
  const [branches, setBranches] = useState<React.ReactNode[]>([]);
  const select = (index: number) => {
    if (!branches.length) return;
    const next = Math.max(0, Math.min(index, branches.length - 1));
    setCurrent(next);
    onBranchChange?.(next);
  };
  return (
    <Branch.Provider value={{ current, branches, setBranches, select }}>
      <View className={"gap-ui-xs " + className}>{children}</View>
    </Branch.Provider>
  );
}
export function MessageBranchContent({ children }: { children: React.ReactNode }) {
  const { current, setBranches } = useBranch();
  const branches = useMemo(() => React.Children.toArray(children), [children]);
  useEffect(() => setBranches(branches), [branches, setBranches]);
  return <>{branches[Math.min(current, Math.max(0, branches.length - 1))]}</>;
}
export function MessageBranchSelector({ children }: { children: React.ReactNode }) {
  const { branches } = useBranch();
  return branches.length > 1 ? (
    <View className="flex-row items-center gap-ui-xs">{children}</View>
  ) : null;
}
export function MessageBranchPrevious() {
  const { current, select } = useBranch();
  return (
    <IconButton
      label="Previous response"
      disabled={current <= 0}
      onPress={() => select(current - 1)}
    >
      <ChevronLeft size={18} color={colors.muted} />
    </IconButton>
  );
}
export function MessageBranchNext() {
  const { current, branches, select } = useBranch();
  return (
    <IconButton
      label="Next response"
      disabled={current >= branches.length - 1}
      onPress={() => select(current + 1)}
    >
      <ChevronRight size={18} color={colors.muted} />
    </IconButton>
  );
}
export function MessageBranchPage() {
  const { current, branches } = useBranch();
  return (
    <Text className="text-xs text-muted-foreground">
      {branches.length ? Math.min(current + 1, branches.length) : 0} / {branches.length}
    </Text>
  );
}
