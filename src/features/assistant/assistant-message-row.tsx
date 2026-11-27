import { StyleSheet, View } from "react-native";
import { MessageText } from "@/ui/message-text";
import { Body } from "@/ui/primitives";
import { chatUserBubbleStyle } from "@/ui/chat";
import { useMobileTheme } from "@/ui/theme";
import { iconSize, space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import Phone from "lucide-react-native/icons/phone";
import type { AssistantMessage } from "../../../../src/shared/model/host-contracts/assistant";
import { dateTimeFormat } from "../../../../src/shared/lib/intl";

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

/** "Call · 15:37" where a voice call began, drawn like the session transcript's dividers. Another day adds its date. */
export function AssistantCallSeparator({ at, now = Date.now() }: { at: number; now?: number }) {
  const copy = useCopy(), locale = useLocale();
  const { colors, uiStyles } = useMobileTheme();
  const date = new Date(at);
  const valid = Number.isFinite(date.getTime());
  const today = valid && date.toDateString() === new Date(now).toDateString();
  const time = valid ? dateTimeFormat(locale, today ? { timeStyle: "short" } : { dateStyle: "medium", timeStyle: "short" }).format(date) : "";
  const label = time ? copy("Görüşme · {p0}", "Call · {p0}", { p0: time }) : copy("Görüşme", "Call");
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={time ? copy("Sesli görüşme, {p0}", "Voice call, {p0}", { p0: time }) : copy("Sesli görüşme", "Voice call")}
      style={{ flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: space.sm }}>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator }} />
      <Phone size={iconSize.inline} color={colors.muted} />
      <Body muted style={[uiStyles.caption, { flexShrink: 1, textAlign: "center" }]}>{label}</Body>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator }} />
    </View>
  );
}
