import Square from "lucide-react-native/icons/square";
import Volume2 from "lucide-react-native/icons/volume-2";
import { IconButton } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { assistantDictationLevel, assistantDictationPartial, cancelAssistantVoice, finishAssistantVoice, recordAssistantVoice, speakAssistantReply, useAssistantCompanion } from "./assistant-companion-state";
import type { AssistantVoiceTarget } from "./assistant-voice";
import { useAssistantCall } from "./assistant-call-state";
import { DictationFeedback, DictationToggle } from "../workspace/composer-dictation";
import { dictationView } from "../workspace/dictation-model";

export function AssistantMicrophone({ target, enabled, current }: { target: AssistantVoiceTarget; enabled: boolean; current(): boolean }) {
  const copy = useCopy();
  const phase = useAssistantCompanion(state => state.voice);
  const callActive = useAssistantCall(state => state.phase !== "idle");
  // The same toggle as the session composer; read-aloud and a call keep it visible but unavailable.
  const view = dictationView(phase === "speaking" ? "idle" : phase, callActive || phase === "speaking" ? "busy" : null, !enabled);
  const label = view.active ? copy("Kaydı bitir", "Finish recording")
    : view.busy ? (phase === "preparing" ? copy("Mikrofon hazırlanıyor", "Preparing microphone") : copy("Yazıya çevriliyor", "Transcribing"))
    : view.action === "busy" ? copy("Sesli görüşme veya kayıt sürüyor", "A voice call or recording is in progress")
    : copy("Sesle yaz", "Dictate message");
  return <DictationToggle view={view} label={label}
    onPress={() => { if (phase === "recording") void finishAssistantVoice(); else void recordAssistantVoice(target, current); }} />;
}

/**
 * Voice status above the assistant composer as one line, never a box: the shared dictation feedback
 * (level, time against the limit, the words heard so far, transcribing, or the failure with Dismiss). A permanent microphone
 * denial keeps its notice, because it needs the system Settings page.
 */
export function AssistantVoiceFeedback() {
  const phase = useAssistantCompanion(state => state.voice), error = useAssistantCompanion(state => state.error);
  return <DictationFeedback phase={phase} error={error} level={assistantDictationLevel} partial={assistantDictationPartial}
    onDismiss={() => useAssistantCompanion.setState({ error: undefined })} />;
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
