import Mic from "lucide-react-native/icons/mic";
import Square from "lucide-react-native/icons/square";
import Volume2 from "lucide-react-native/icons/volume-2";
import { View } from "react-native";
import { IconButton } from "@/ui/primitives";
import { StatusLine } from "@/ui/feedback";
import { ChatCircleAction } from "@/ui/chat-controls";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { cancelAssistantVoice, finishAssistantVoice, recordAssistantVoice, speakAssistantReply, useAssistantCompanion } from "./assistant-companion-state";
import type { AssistantVoiceTarget } from "./assistant-voice";
import { useAssistantCall } from "./assistant-call-state";
import { isMicrophoneDenied, MicrophonePermissionNotice } from "../voice-settings/microphone-permission-notice";
import { assistantVoiceErrorMessage } from "./assistant-voice-error";

export function AssistantMicrophone({ target, enabled, current }: { target: AssistantVoiceTarget; enabled: boolean; current(): boolean }) {
  const copy = useCopy(), { colors } = useMobileTheme();
  const phase = useAssistantCompanion(state => state.voice);
  const callActive = useAssistantCall(state => state.phase !== "idle");
  const active = phase === "recording";
  return <ChatCircleAction label={active ? copy("Kaydı bitir", "Finish recording") : copy("Sesle yaz", "Dictate message")}
    active={active} disabled={(!active && (!enabled || callActive || phase !== "idle"))} busy={phase === "preparing" || phase === "transcribing"}
    onPress={() => { if (active) void finishAssistantVoice(); else void recordAssistantVoice(target, current); }}>
    {active ? <Square size={18} color={colors.primaryText} /> : <Mic size={18} color={colors.accent} />}
  </ChatCircleAction>;
}

/**
 * Voice status above the assistant composer as one line, never a box: "Listening" while recording and
 * the failure in the owner's language with a Dismiss. A permanent microphone denial keeps its notice,
 * because it needs the system Settings page.
 */
export function AssistantVoiceFeedback() {
  const copy = useCopy(), phase = useAssistantCompanion(state => state.voice), error = useAssistantCompanion(state => state.error);
  if (isMicrophoneDenied(error)) return <MicrophonePermissionNotice />;
  if (error) return <View accessibilityLiveRegion="polite"><StatusLine tone="danger" label={assistantVoiceErrorMessage(error, copy)}
    action={{ label: copy("Kapat", "Dismiss"), onPress: () => useAssistantCompanion.setState({ error: undefined }) }} /></View>;
  if (phase === "recording") return <View accessibilityLiveRegion="polite"
    accessibilityLabel={copy("Dinleniyor. Bitirince metni inceleyip gönder. Kayıt en fazla 30 saniye.", "Listening. Finish, then review and send the text. Recording is limited to 30 seconds.")}>
    <StatusLine tone="info" busy label={copy("Dinleniyor (en fazla 30 saniye)", "Listening (up to 30 seconds)")} />
  </View>;
  if (phase === "transcribing") return <StatusLine busy label={copy("Yazıya çevriliyor", "Transcribing")} />;
  return null;
}

export function AssistantReadAloud({ target, text, enabled, current }: { target: AssistantVoiceTarget; text: string; enabled: boolean; current(): boolean }) {
  const copy = useCopy(), { colors } = useMobileTheme();
  const phase = useAssistantCompanion(state => state.voice), speaking = phase === "speaking";
  const callActive = useAssistantCall(state => state.phase !== "idle");
  return <IconButton label={speaking ? copy("Sesi durdur", "Stop audio") : copy("Yanıtı sesli oku", "Read reply aloud")}
    disabled={!speaking && (!enabled || callActive || !text.trim() || phase !== "idle")}
    onPress={() => { if (speaking) cancelAssistantVoice(); else void speakAssistantReply(target, text, current); }}>
    {speaking ? <Square size={18} color={colors.text} /> : <Volume2 size={18} color={colors.accent} />}
  </IconButton>;
}
