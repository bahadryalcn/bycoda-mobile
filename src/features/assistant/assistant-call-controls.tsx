import AudioLines from "lucide-react-native/icons/audio-lines";
import PhoneOff from "lucide-react-native/icons/phone-off";
import PictureInPicture2 from "lucide-react-native/icons/picture-in-picture-2";
import MicOff from "lucide-react-native/icons/mic-off";
import { Body, Button, Disclosure, Row, IconButton } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { iconSize } from "@/ui/tokens";
import { useAssistantCall } from "./assistant-call-state";
import { assistantCallErrorMessage } from "./assistant-call-error";
import { startAssistantCall, endAssistantCall, pictureInPictureAssistant, muteAssistantCall } from "./assistant-call-session";
import { openAssistantCompanion, cancelAssistantVoice } from "./assistant-companion-state";
import { assistantPictureInPictureSupported } from "./assistant-platform";
import type { AssistantVoiceTarget } from "./assistant-voice";

export function AssistantCallButton({ target, enabled, current, onStart }: { target: AssistantVoiceTarget; enabled: boolean; current(): boolean; onStart?(): void }) {
  const copy = useCopy(), { colors } = useMobileTheme(), call = useAssistantCall();
  const active = call.phase !== "idle";
  // In the conversation the composer's Send is the one filled action; the call starts from a labelled icon.
  if (onStart) return <IconButton label={copy("Sesli görüşme", "Voice call")} disabled={active || !enabled} onPress={onStart}>
    <AudioLines size={iconSize.action} color={colors.accent} />
  </IconButton>;
  return <Row>
    <Button label={active ? copy("Görüşmeyi bitir", "End voice call") : copy("Sesli görüşme", "Voice call")}
      busy={call.phase === "starting"} disabled={!active && !enabled}
      tone={active ? "quiet" : "primary"}
      onPress={() => { if (active) endAssistantCall(); else { cancelAssistantVoice(); openAssistantCompanion(target.machineId, target.environmentId); void startAssistantCall(target, current); } }}>
      <Row>{active ? <PhoneOff size={18} color={colors.accent} /> : <AudioLines size={18} color={colors.primaryText} />}</Row>
    </Button>
    {active ? <>
      <IconButton label={call.muted ? copy("Mikrofonu aç", "Unmute microphone") : copy("Mikrofonu kapat", "Mute microphone")}
        onPress={() => muteAssistantCall(!call.muted)}><MicOff size={iconSize.action} color={call.muted ? colors.danger : colors.text} /></IconButton>
      {assistantPictureInPictureSupported() ? <IconButton label={copy("Küçük pencerede aç", "Open picture in picture")} onPress={() => { void pictureInPictureAssistant().catch(error => useAssistantCall.setState({ error })); }}>
        <PictureInPicture2 size={iconSize.action} color={colors.text} />
      </IconButton> : null}
    </> : null}
    </Row>;
}

/** The last call failure, full width under the header row so a narrow button column never squeezes it. */
export function AssistantCallError() {
  const copy = useCopy(), call = useAssistantCall();
  return call.error ? <Disclosure label={copy("Sesli görüşme kullanılamıyor", "Voice call unavailable")}>
    <Body muted>{assistantCallErrorMessage(call.error, copy)}</Body>
  </Disclosure> : null;
}
