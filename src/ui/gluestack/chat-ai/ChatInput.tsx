import React, { useContext, useState } from "react";
import { View, type ViewProps, type TextInputProps } from "react-native";
import { ChatContext } from "./context";
import { Input } from "../../fields";
import { Button } from "../../buttons";
import { ErrorText } from "../../feedback";
type Props = ViewProps & {
  onSend?: (input: string) => void | Promise<void>;
  placeholder?: string;
  inputProps?: TextInputProps;
  sendButtonText?: string;
  renderSendButton?: (onPress: () => void, disabled: boolean) => React.ReactElement;
};
export const ChatInput = React.forwardRef<View, Props>(function ChatInput(
  {
    onSend,
    placeholder = "Write a message",
    inputProps,
    sendButtonText = "Send",
    renderSendButton,
    ...props
  },
  ref,
) {
  const context = useContext(ChatContext);
  const [local, setLocal] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const value = inputProps?.value ?? local;
  const change = (text: string) => {
    setLocal(text);
    inputProps?.onChangeText?.(text);
  };
  const busy = sending || !!context?.loading;
  const send = onSend ?? context?.send;
  const disabled = busy || !send || !value.trim();
  const submit = async () => {
    if (disabled || !send) return;
    setSending(true);
    setError(null);
    const submitted = value;
    try {
      await send(submitted);
      if (inputProps?.value === undefined)
        setLocal((current) => (current === submitted ? "" : current));
    } catch (cause) {
      setError(cause);
    } finally {
      setSending(false);
    }
  };
  return (
    <View {...props} ref={ref} className={"gap-ui-xs " + (props.className ?? "")}>
      <View className="flex-row items-end gap-ui-xs rounded-preview border border-border bg-panel p-ui-xs">
        <Input
          {...inputProps}
          label={inputProps?.accessibilityLabel ?? "Message"}
          value={value}
          onChangeText={change}
          placeholder={placeholder}
          multiline
          editable={!busy}
          style={[{ flex: 1, minWidth: 0 }, inputProps?.style]}
        />
        {renderSendButton ? (
          renderSendButton(() => {
            void submit();
          }, disabled)
        ) : (
          <Button
            label={sendButtonText}
            disabled={disabled}
            busy={busy}
            onPress={() => {
              void submit();
            }}
          />
        )}
      </View>
      <ErrorText error={error} />
    </View>
  );
});
