import React, { createContext, useContext, useState, type ReactNode } from "react";
import { View, type ViewProps, type TextInputProps } from "react-native";
import Send from "lucide-react-native/icons/send";
import Plus from "lucide-react-native/icons/plus";
import { Input } from "../../fields";
import { IconButton, Button } from "../../buttons";
import { colors } from "../../tokens";
import type { FileUIPart } from "ai";
export type { FileUIPart } from "ai";
type PromptContext = {
  text: string;
  setText: (text: string) => void;
  submit: () => void;
  disabled: boolean;
  canSubmit: boolean;
};
const Prompt = createContext<PromptContext | null>(null);
function usePrompt() {
  const value = useContext(Prompt);
  if (!value) throw new Error("Prompt parts require PromptInput");
  return value;
}
export type PromptInputProps = ViewProps & {
  ref?: React.Ref<View>;
  className?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  onSubmit?: (value: { text: string; files: FileUIPart[] }) => void;
  isDisabled?: boolean;
  managed?: boolean;
};
/** Controlled mode preserves app-owned drafts and uploads; no network or device picker side effects. */
export function PromptInput({
  value,
  onChangeText,
  onSubmit,
  isDisabled = false,
  managed = false,
  className = "",
  ...props
}: PromptInputProps) {
  const [local, setLocal] = useState("");
  const attachments = useContext(Attachments);
  const text = value ?? local;
  const setText = onChangeText ?? setLocal;
  const submit = () => {
    if (isDisabled || (!text.trim() && !attachments?.files.length)) return;
    onSubmit?.({ text, files: attachments?.files ?? [] });
  };
  return (
    <Prompt.Provider
      value={{
        text,
        setText,
        submit,
        disabled: isDisabled,
        canSubmit: !isDisabled && (!!text.trim() || !!attachments?.files.length),
      }}
    >
      <View
        {...props}
        className={
          (managed ? "" : "rounded-preview border border-border bg-panel p-ui-xs ") + className
        }
      />
    </Prompt.Provider>
  );
}
export const PromptInputBody = ({ children }: { children: ReactNode }) => (
  <View className="min-w-0 flex-1">{children}</View>
);
export function PromptInputTextarea({
  label = "Message",
  ...props
}: Omit<TextInputProps, "value" | "onChangeText"> & { label?: string }) {
  const context = usePrompt();
  return (
    <Input
      {...props}
      label={label}
      value={context.text}
      onChangeText={context.setText}
      editable={!context.disabled}
      multiline
    />
  );
}
export const PromptInputFooter = ({ children }: { children: ReactNode }) => (
  <View className="flex-row items-center justify-between gap-ui-xs">{children}</View>
);
export const PromptInputTools = ({ children }: { children: ReactNode }) => (
  <View className="flex-row items-center gap-ui-xs">{children}</View>
);
export function PromptInputButton({
  children,
  label = "Prompt action",
  onPress,
  disabled,
}: {
  children: ReactNode;
  label?: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Button label={label} onPress={() => onPress?.()} disabled={disabled || !onPress} tone="quiet">
      {children}
    </Button>
  );
}
export function PromptInputSubmit({ label = "Send" }: { label?: string }) {
  const context = usePrompt();
  return (
    <IconButton label={label} onPress={context.submit} disabled={!context.canSubmit}>
      <Send size={18} color={colors.text} />
    </IconButton>
  );
}
type AttachmentContext = {
  files: (FileUIPart & { id: string })[];
  add: (files: (FileUIPart & { id: string })[]) => void;
  remove: (id: string) => void;
  clear: () => void;
  openImagePicker?: () => void;
  openFilePicker?: () => void;
};
const Attachments = createContext<AttachmentContext | null>(null);
export function PromptInputProvider({
  children,
  onPickImages,
  onPickFiles,
}: {
  children: ReactNode;
  onPickImages?: () => void;
  onPickFiles?: () => void;
}) {
  const [files, setFiles] = useState<(FileUIPart & { id: string })[]>([]);
  return (
    <Attachments.Provider
      value={{
        files,
        add: (items) =>
          setFiles((prev) => [
            ...prev,
            ...items.filter((item) => !prev.some((old) => old.id === item.id)),
          ]),
        remove: (id) => setFiles((prev) => prev.filter((item) => item.id !== id)),
        clear: () => setFiles([]),
        openImagePicker: onPickImages,
        openFilePicker: onPickFiles,
      }}
    >
      {children}
    </Attachments.Provider>
  );
}
export function usePromptInputAttachments() {
  const value = useContext(Attachments);
  if (!value) throw new Error("Attachments require PromptInputProvider");
  return value;
}
export const PromptInputActionMenu = ({ children }: { children: ReactNode }) => (
  <View>{children}</View>
);
export function PromptInputActionMenuTrigger({
  label = "Attach files",
  onPress,
  children,
}: {
  label?: string;
  onPress?: () => void;
  children?: ReactNode;
}) {
  return (
    <IconButton label={label} onPress={() => onPress?.()} disabled={!onPress}>
      {children ?? <Plus size={18} color={colors.muted} />}
    </IconButton>
  );
}
export function PromptInputActionMenuContent({ children }: { children: ReactNode }) {
  return <View className="gap-ui-xs">{children}</View>;
}
