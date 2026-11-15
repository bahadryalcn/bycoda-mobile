import Mic from "lucide-react-native/icons/mic";
import Square from "lucide-react-native/icons/square";
import Volume2 from "lucide-react-native/icons/volume-2";
import { View } from "react-native";
import { Body, Disclosure, IconButton } from "@/ui/primitives";
import { ChatCircleAction } from "@/ui/chat-controls";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { cancelAssistantVoice, finishAssistantVoice, recordAssistantVoice, speakAssistantReply, useAssistantCompanion } from "./assistant-companion-state";
import type { AssistantVoiceTarget } from "./assistant-voice";
import { useAssistantCall } from "./assistant-call-state";

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

export function AssistantVoiceFeedback() {
  const copy = useCopy(), phase = useAssistantCompanion(state => state.voice), error = useAssistantCompanion(state => state.error);
  return <>{error ? <View accessibilityLiveRegion="polite"><Disclosure tone="warning" label={copy("Ses kullanılamıyor", "Voice unavailable")}
      detail={copy("Mikrofon iznini ve bilgisayardaki ses kurulumunu kontrol et.", "Check microphone permission and voice setup on your computer.")}>
      <Body selectable>{error instanceof Error ? error.message : String(error)}</Body>
    </Disclosure></View> : null}
    {phase === "recording" ? <Body muted accessibilityLiveRegion="polite"
      accessibilityLabel={copy("Dinleniyor. Bitirince metni inceleyip gönder. Kayıt en fazla 30 saniye.", "Listening. Finish, then review and send the text. Recording is limited to 30 seconds.")}>{copy("Dinleniyor (en fazla 30 saniye)", "Listening (up to 30 seconds)")}</Body> : null}
  </>;
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
