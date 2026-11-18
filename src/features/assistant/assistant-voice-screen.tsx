import type { PropsWithChildren, ReactNode } from "react";
import { Keyboard, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AudioLines from "lucide-react-native/icons/audio-lines";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import Mic from "lucide-react-native/icons/mic";
import MicOff from "lucide-react-native/icons/mic-off";
import MessageSquare from "lucide-react-native/icons/message-square";
import Pause from "lucide-react-native/icons/pause";
import PhoneOff from "lucide-react-native/icons/phone-off";
import Send from "lucide-react-native/icons/send";
import Volume2 from "lucide-react-native/icons/volume-2";
import VolumeX from "lucide-react-native/icons/volume-x";
import { Body, Button, Disclosure, IconButton } from "@/ui/primitives";
import { CallControl } from "@/ui/call-control";
import { useCopy } from "@/ui/copy";
import { BusyIndicator } from "@/ui/busy-indicator";
import { useMobileTheme } from "@/ui/theme";
import { radii, space } from "@/ui/tokens";
import { useAssistantCall } from "./assistant-call-state";
import { finishAssistantCallTurn, muteAssistantCall, setAssistantCallSpeakerMuted, silenceAssistantCall } from "./assistant-call-session";
import { AssistantAvatar } from "./assistant-avatar";
import { AssistantOwnerAvatar, useAssistantOwner } from "./assistant-owner-avatar";
import { AssistantVoiceBackdrop, AssistantVoiceOrb } from "./assistant-voice-stage";
import { assistantOrbState } from "./assistant-voice-presentation";
import { SessionKeyboardFrame } from "../workspace/session-keyboard-frame";

/**
 * The full-screen voice call: a coloured stage and a large orb that react to the call, who is talking
 * (the owner's or the assistant's picture), the words in flight, and a phone-style control dock.
 * Opening the chat shrinks the stage to a strip; the transcript and composer stay mounted throughout.
 */
export function AssistantVoiceScreen({ active, stage = false, name, scope, avatar, transcriptVisible, pending, ready, composer, feedback, onToggleTranscript, onMinimize, onEnd, onStart, children }: PropsWithChildren<{
  active: boolean;
  /** The assistant's home sits on the same calm stage, so starting a call only wakes it up. */
  stage?: boolean;
  composer: ReactNode; feedback?: ReactNode;
  name: string; scope: string; avatar?: string; transcriptVisible: boolean; pending: boolean; ready: boolean;
  onToggleTranscript(): void; onMinimize(): void; onEnd(): void; onStart(): void;
}>) {
  const copy = useCopy(), { colors, uiStyles } = useMobileTheme(), insets = useSafeAreaInsets();
  const call = useAssistantCall(), viewport = useWindowDimensions(), owner = useAssistantOwner();
  const state = pending && call.phase === "idle" && !call.error ? "thinking" : assistantOrbState(call.phase, call.muted, call.error);
  const live = call.phase !== "idle" && call.phase !== "starting";
  // From the tap until the first listen: microphone permission and the computer's voice line.
  const connecting = !call.error && (call.phase === "starting" || (pending && call.phase === "idle"));
  const status = connecting ? copy("Bağlanıyor…", "Connecting…")
    : state === "error" ? copy("Görüşme durdu", "Call stopped")
    : state === "muted" ? copy("Mikrofon kapalı", "Microphone muted")
    : state === "listening" ? copy("Dinleniyor", "Listening")
    : state === "speaking" ? copy("Sesli yanıt", "Speaking")
    : state === "thinking" ? copy("Yanıt bekleniyor", "Waiting for reply")
    : copy("Sesli görüşme", "Voice call");
  // Who holds the turn: the owner while listening, the assistant while it thinks or answers.
  const ownerTurn = state === "listening" || state === "muted";
  const caption = call.phase === "sending" ? call.utterance : call.phase === "speaking" ? call.lastReply : undefined;
  const chatVisible = !active || transcriptVisible;
  const orbSize = transcriptVisible
    ? Math.max(72, Math.min(112, viewport.height * 0.14))
    : Math.max(160, Math.min(340, viewport.width - space.xxl * 2, viewport.height * 0.42));
  const iconOn = colors.text, iconSelected = colors.background;
  const dock = active ? <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: space.xl, rowGap: space.md, paddingHorizontal: space.lg, paddingTop: space.md }}>
    <CallControl label={copy("Mikrofon", "Microphone")} selected={call.muted} disabled={!live}
      accessibilityLabel={call.muted ? copy("Mikrofonu aç", "Unmute microphone") : copy("Mikrofonu kapat", "Mute microphone")}
      onPress={() => muteAssistantCall(!call.muted)}>
      {call.muted ? <MicOff size={26} color={iconSelected} /> : <Mic size={26} color={iconOn} />}
    </CallControl>
    <CallControl label={copy("Sustur", "Silence")} disabled={call.phase !== "speaking"}
      accessibilityLabel={copy("Yanıtı durdur ve tekrar dinle", "Stop the reply and listen again")}
      onPress={() => { silenceAssistantCall(); }}>
      <Pause size={26} color={iconOn} />
    </CallControl>
    <CallControl label={copy("Hoparlör", "Loudspeaker")} selected={call.speakerMuted} disabled={!live}
      accessibilityLabel={call.speakerMuted ? copy("Hoparlörü aç", "Unmute speaker") : copy("Hoparlörü sustur", "Mute speaker")}
      onPress={() => setAssistantCallSpeakerMuted(!call.speakerMuted)}>
      {call.speakerMuted ? <VolumeX size={26} color={iconSelected} /> : <Volume2 size={26} color={iconOn} />}
    </CallControl>
    <CallControl label={copy("Bitir", "End")} accessibilityLabel={copy("Görüşmeyi bitir", "End voice call")} danger onPress={onEnd}>
      <PhoneOff size={26} color={colors.primaryText} />
    </CallControl>
  </View> : null;
  const speakerPicture = connecting ? <View style={{ paddingLeft: space.sm }}><BusyIndicator size="sm" color={colors.text} /></View>
    : ownerTurn ? owner ? <AssistantOwnerAvatar owner={owner} size="sm" /> : null : avatar ? <AssistantAvatar value={avatar} size={32} /> : null;
  const speaker = <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "center", maxWidth: "100%", gap: space.sm, minHeight: 40, paddingVertical: space.xs, paddingLeft: speakerPicture ? space.xs : space.lg, paddingRight: space.lg, borderRadius: radii.pill, backgroundColor: colors.glass }}>
    {speakerPicture}
    {/* Selectable text mis-measures inside a content-sized Android row and clips; a status needs no selection. */}
    <Body selectable={false} style={[uiStyles.buttonLabel, { flexShrink: 1 }]} accessibilityLiveRegion="polite">{status}</Body>
  </View>;
  return <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.background }}>
    {active || stage ? <AssistantVoiceBackdrop state={active ? state : "idle"} level={active ? call.level : 0} /> : null}
    <View style={{ flex: 1, minHeight: 0, paddingTop: active ? insets.top : 0, paddingLeft: active ? insets.left : 0, paddingRight: active ? insets.right : 0 }}>
    <SessionKeyboardFrame transparent={active || stage} composer={<>
      <View style={{ display: chatVisible ? "flex" : "none" }} accessibilityElementsHidden={!chatVisible} importantForAccessibility={chatVisible ? "auto" : "no-hide-descendants"}>{composer}</View>
      {dock}
    </>}>
      {active ? <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm, paddingVertical: space.xs }}>
        <IconButton label={copy("Asistanı küçült", "Minimize assistant")} onPress={onMinimize}><ChevronDown size={26} color={colors.text} /></IconButton>
        <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm }}>
          <AssistantAvatar value={avatar} size={36} />
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Body numberOfLines={1} style={uiStyles.heading}>{name}</Body>
            <Body numberOfLines={1} muted style={uiStyles.caption}>{scope}</Body>
          </View>
        </View>
        <IconButton label={transcriptVisible ? copy("Sohbeti gizle", "Hide chat") : copy("Sohbeti göster", "Show chat")} expanded={transcriptVisible}
          onPress={() => { if (transcriptVisible) Keyboard.dismiss(); onToggleTranscript(); }}>
          <MessageSquare size={24} color={transcriptVisible ? colors.accent : colors.text} />
        </IconButton>
      </View> : null}
      {active && transcriptVisible ? <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        <AssistantVoiceOrb state={state} level={call.level} size={orbSize} label={status} />
        <View style={{ flex: 1, minWidth: 0, alignItems: "flex-start", gap: space.xs }}>
          {speaker}
          {caption ? <Body numberOfLines={2} muted>{caption}</Body> : null}
        </View>
      </View> : null}
      {active && !transcriptVisible ? <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", gap: space.lg, paddingHorizontal: space.xl, paddingVertical: space.lg }}>
        <AssistantVoiceOrb state={state} level={call.level} size={orbSize} label={status} />
        {speaker}
        {caption ? <Body numberOfLines={4} style={[uiStyles.body, { textAlign: "center", maxWidth: 520 }]}>{caption}</Body>
          : connecting ? <Body muted style={{ textAlign: "center", maxWidth: 420 }}>{copy("Mikrofon ve bilgisayarınla ses bağlantısı hazırlanıyor.", "Getting the microphone and the voice line to your computer ready.")}</Body>
          : state === "listening" ? <Body muted style={{ textAlign: "center", maxWidth: 420 }}>{copy("Doğal konuşun. Durduğunuzda sözleriniz gönderilir.", "Speak naturally. When you pause, your words are sent.")}</Body> : null}
        {state === "listening" ? <Button label={copy("Şimdi gönder", "Send now")} tone="quiet" style={{ alignSelf: "center" }} onPress={finishAssistantCallTurn}>
          <Send size={18} color={colors.accent} />
        </Button> : null}
        <View style={{ alignSelf: "stretch", maxWidth: 520, gap: space.sm }}>
          {call.error ? <Disclosure label={copy("Sesli görüşme kullanılamıyor", "Voice call unavailable")}>
            <Body muted>{call.error instanceof Error ? call.error.message : String(call.error)}</Body>
          </Disclosure> : null}
          {feedback}
        </View>
        {call.phase === "idle" && !pending ? <Button label={copy("Sesli görüşme", "Voice call")} tone="primary" fullWidth disabled={!ready} onPress={onStart}>
          <AudioLines size={18} color={colors.primaryText} />
        </Button> : null}
      </ScrollView> : null}
      {/* Concealing chrome never unmounts the transcript, editor or its draft owner. */}
      <View style={{ flex: chatVisible ? 1 : 0, minHeight: 0, display: chatVisible ? "flex" : "none" }} accessibilityElementsHidden={!chatVisible} importantForAccessibility={chatVisible ? "auto" : "no-hide-descendants"}>
        {children}
      </View>
    </SessionKeyboardFrame>
    </View>
  </View>;
}
