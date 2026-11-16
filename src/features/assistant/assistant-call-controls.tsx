import { View } from "react-native";
import AudioLines from "lucide-react-native/icons/audio-lines";
import PhoneOff from "lucide-react-native/icons/phone-off";
import PictureInPicture2 from "lucide-react-native/icons/picture-in-picture-2";
import MicOff from "lucide-react-native/icons/mic-off";
import { Body, Button, Disclosure, Row, IconButton } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { useAssistantCall } from "./assistant-call-state";
import { startAssistantCall, endAssistantCall, pictureInPictureAssistant, muteAssistantCall } from "./assistant-call-session";
import { openAssistantCompanion, cancelAssistantVoice } from "./assistant-companion-state";
import type { AssistantVoiceTarget } from "./assistant-voice";

export function AssistantCallButton({ target, enabled, current, onStart }: { target: AssistantVoiceTarget; enabled: boolean; current(): boolean; onStart?(): void }) {
  const copy = useCopy(), { colors } = useMobileTheme(), call = useAssistantCall();
  const active = call.phase !== "idle";
  return <View style={{ gap: space.xs }}>
    <Row>
    <Button label={active && !onStart ? copy("Görüşmeyi bitir", "End voice call") : copy("Sesli görüşme", "Voice call")}
      busy={call.phase === "starting"} disabled={!active && !enabled}
      tone={active ? "quiet" : "primary"}
      onPress={() => { if (onStart) onStart(); else if (active) endAssistantCall(); else { cancelAssistantVoice(); openAssistantCompanion(target.machineId, target.environmentId); void startAssistantCall(target, current); } }}>
      <Row>{active ? <PhoneOff size={18} color={colors.accent} /> : <AudioLines size={18} color={colors.primaryText} />}</Row>
    </Button>
    {active && !onStart ? <>
      <IconButton label={call.muted ? copy("Mikrofonu aç", "Unmute microphone") : copy("Mikrofonu kapat", "Mute microphone")}
        onPress={() => muteAssistantCall(!call.muted)}><MicOff size={18} color={call.muted ? colors.danger : colors.text} /></IconButton>
      <IconButton label={copy("Küçük pencerede aç", "Open picture in picture")} onPress={() => { void pictureInPictureAssistant().catch(error => useAssistantCall.setState({ error })); }}>
        <PictureInPicture2 size={18} color={colors.text} />
      </IconButton>
    </> : null}
    </Row>
    {call.error ? <Disclosure label={copy("Sesli görüşme kullanılamıyor", "Voice call unavailable")}>
      <Body muted>{call.error instanceof Error ? call.error.message : String(call.error)}</Body>
    </Disclosure> : null}
  </View>;
}
