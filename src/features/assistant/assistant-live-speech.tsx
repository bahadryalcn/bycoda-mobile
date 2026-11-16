import { View } from "react-native";
import { MessageText } from "@/ui/message-text";
import { chatUserBubbleStyle } from "@/ui/chat";
import { Body } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { useAssistantCall } from "./assistant-call-state";
import type { AssistantVoiceTarget } from "./assistant-voice";

/** The owner's recognized words while a reply is pending; never an invented Host message. */
export function AssistantLiveSpeech({ target }: { target?: AssistantVoiceTarget }) {
  const call = useAssistantCall(), copy = useCopy(), { colors } = useMobileTheme();
  if (!target || !call.utterance || call.phase !== "sending" || call.target?.machineId !== target.machineId || call.target.environmentId !== target.environmentId || call.target.threadId !== target.threadId) return null;
  return <View style={chatUserBubbleStyle(colors)}>
    <MessageText text={call.utterance} role="user" compactMedia />
    <Body muted>{copy("Sesle", "By voice")}</Body>
  </View>;
}
