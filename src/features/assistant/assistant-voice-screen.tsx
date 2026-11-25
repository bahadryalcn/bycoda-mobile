import type { ComponentProps, PropsWithChildren, ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { Keyboard, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AudioLines from "lucide-react-native/icons/audio-lines";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import Mic from "lucide-react-native/icons/mic";
import MicOff from "lucide-react-native/icons/mic-off";
import MessageSquare from "lucide-react-native/icons/message-square";
import SkipForward from "lucide-react-native/icons/skip-forward";
import PhoneOff from "lucide-react-native/icons/phone-off";
import RotateCcw from "lucide-react-native/icons/rotate-ccw";
import Send from "lucide-react-native/icons/send";
import Volume2 from "lucide-react-native/icons/volume-2";
import VolumeX from "lucide-react-native/icons/volume-x";
import { Body, Button, HeaderBackButton, IconButton, ScopeLine, type PageScope } from "@/ui/primitives";
import { CallControl } from "@/ui/call-control";
import { useCopy } from "@/ui/copy";
import { BusyIndicator } from "@/ui/busy-indicator";
import { useMobileTheme } from "@/ui/theme";
import { iconSize, radii, space } from "@/ui/tokens";
import { useAssistantCall } from "./assistant-call-state";
import { AssistantCallError } from "./assistant-call-error";
import { assistantVoiceErrorMessage } from "./assistant-voice-error";
import { finishAssistantCallTurn, muteAssistantCall, setAssistantCallSpeakerMuted, silenceAssistantCall } from "./assistant-call-session";
import { AssistantAvatar } from "./assistant-avatar";
import { AssistantOwnerAvatar, useAssistantOwner } from "./assistant-owner-avatar";
import { AssistantVoiceBackdrop, AssistantVoiceOrb } from "./assistant-voice-stage";
import { assistantOrbState, assistantVoiceFailureTitle, assistantVoiceStageLabel } from "./assistant-voice-presentation";
import { SessionKeyboardFrame } from "../workspace/session-keyboard-frame";
import { isMicrophoneDenied, MicrophonePermissionNotice } from "../voice-settings/microphone-permission-notice";
import { CallVoiceButton } from "../voice-settings/call-voice-button";
import { useVoicePreferences } from "../voice-settings/voice-preferences";

function AssistantCallOrb(props: Omit<ComponentProps<typeof AssistantVoiceOrb>, "level">) {
  const level = useAssistantCall(call => props.state === "listening" ? call.level : 0);
  return <AssistantVoiceOrb {...props} level={level} />;
}

/** Above this microphone level the phone says it hears the owner, as the desktop's "Microphone is receiving sound". */
export const ASSISTANT_HEARING_LEVEL = 0.12;

/**
 * The line under the status while recording. Sound on the microphone is said in words, so reduced
 * motion (which stills the orb) and VoiceOver still confirm that the phone hears the owner.
 */
function AssistantRecordingHint({ manual, centered }: { manual: boolean; centered: boolean }) {
  const copy = useCopy();
  const hearing = useAssistantCall(call => call.level >= ASSISTANT_HEARING_LEVEL);
  return <Body muted accessibilityLiveRegion="polite" style={{ textAlign: centered ? "center" : "left", maxWidth: 420 }}>{hearing
    ? copy("Mikrofon ses alıyor", "Microphone is receiving sound")
    : manual ? copy("Bitirdiğinde Şimdi gönder’e dokun.", "Tap Send now when you are done.")
    : copy("Doğal konuşun. Durduğunuzda sözleriniz gönderilir.", "Speak naturally. When you pause, your words are sent.")}</Body>;
}

/**
 * The full-screen voice call: a coloured stage and a large orb that react to the call, who is talking
 * (the owner's or the assistant's picture), the words in flight, and a phone-style control dock.
 * Opening the chat shrinks the stage to a strip; the transcript and composer stay mounted throughout.
 */
export function AssistantVoiceScreen({ active, stage = false, name, computer, scope, avatar, transcriptVisible, pending, ready, composer, feedback, settings, onToggleTranscript, onMinimize, onEnd, onStart, onBack, children }: PropsWithChildren<{
  active: boolean;
  /** The assistant's home sits on the same calm stage, so starting a call only wakes it up. */
  stage?: boolean;
  composer: ReactNode; feedback?: ReactNode; settings?: ReactNode;
  /** The connected computer that transcribes and voices the call. */
  computer: string;
  /** Which computer (and project) the call works in, as the shared scope line. */
  name: string; scope: PageScope; avatar?: string; transcriptVisible: boolean; pending: boolean; ready: boolean;
  onToggleTranscript(): void; onMinimize(): void; onEnd(): void; onStart(): void;
  /** Leaves the home stage, which hides the native header to draw its own over the light. */
  onBack?(): void;
}>) {
  const copy = useCopy(), { colors, uiStyles } = useMobileTheme(), insets = useSafeAreaInsets();
  const call = useAssistantCall(useShallow(({ phase, capture, error, muted, speakerMuted, stage, utterance, lastReply }) =>
    ({ phase, capture, error, muted, speakerMuted, stage, utterance, lastReply })));
  const sleep = useAssistantCall(useShallow(({ asleep, reconnecting }) => ({ asleep, reconnecting })));
  const manualTurnEnd = useVoicePreferences().preferences.manualTurnEnd;
  const viewport = useWindowDimensions(), owner = useAssistantOwner();
  // A dropped voice line is reopened on its own: the call reads as connecting, never as stopped.
  const reconnecting = !call.error && !!sleep.reconnecting;
  const state = (reconnecting || pending) && call.phase === "idle" && !call.error ? "thinking" : assistantOrbState(call.phase, call.muted, call.error);
  const live = call.phase !== "idle" && call.phase !== "starting";
  // From the tap until the first listen: microphone permission and the computer's voice line.
  const connecting = !call.error && !reconnecting && (call.phase === "starting" || (pending && call.phase === "idle"));
  // Three minutes without speech closes the microphone; Talk wakes the call again.
  const asleep = !!sleep.asleep && call.phase === "idle" && !pending && !reconnecting && !call.error;
  // Listening has begun but the computer is still loading its speech model: nothing is recorded yet.
  const preparing = !call.error && !connecting && state === "listening" && call.capture === "preparing";
  const recording = state === "listening" && call.capture === "recording";
  const status = reconnecting ? copy("Yeniden bağlanıyor…", "Reconnecting…")
    : connecting ? copy("Bağlanıyor…", "Connecting…")
    : state === "error" ? copy("Görüşme durdu", "Call stopped")
    : state === "muted" ? copy("Bağlı · Mikrofon kapalı", "Connected · Microphone off")
    : preparing ? copy("{p0} hazırlanıyor…", "Getting {p0} ready…", { p0: computer })
    : state === "listening" && call.capture === "transcribing" ? assistantVoiceStageLabel("transcription", computer, copy)
    : state === "listening" ? copy("Dinleniyor", "Listening")
    : state === "speaking" && call.stage === "synthesis" ? assistantVoiceStageLabel("synthesis", computer, copy)
    : state === "speaking" ? copy("Sesli yanıt", "Speaking")
    : state === "thinking" ? copy("Yanıt bekleniyor", "Waiting for reply")
    : asleep ? copy("Hazır. Mikrofon kapalı.", "Ready. Microphone is off.")
    : copy("Bağlanmaya hazır", "Ready to connect");
  // Who holds the turn: the owner while listening, the assistant while it thinks or answers.
  const ownerTurn = state === "listening" || state === "muted";
  const caption = call.phase === "sending" ? call.utterance : call.phase === "speaking" ? call.lastReply : undefined;
  const chatVisible = !active || transcriptVisible;
  // A permanently denied microphone needs the system Settings page, not another call attempt.
  // The stopped step and its cause stay in view: a folded failure left only "Call stopped" on screen.
  const callFailure = isMicrophoneDenied(call.error) ? <MicrophonePermissionNotice /> : call.error ? (
    <View accessibilityRole="alert" style={{ gap: space.xs, padding: space.md, borderRadius: radii.card, backgroundColor: colors.glass, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
      <Body selectable={false} style={[uiStyles.buttonLabel, { textAlign: transcriptVisible ? "left" : "center" }]}>{assistantVoiceFailureTitle(call.stage, computer, copy)}</Body>
      <Body muted style={{ textAlign: transcriptVisible ? "left" : "center" }}>{assistantVoiceErrorMessage(call.error, copy, { stage: call.stage, computer })}</Body>
      {/* "Check the previous message" needs the conversation, where its status check lives; one tap opens it. */}
      {call.error instanceof AssistantCallError && (call.error.reason === "send-unreviewed" || call.error.reason === "result-unknown") && !transcriptVisible
        ? <Button label={copy("Sohbeti göster", "Show chat")} tone="quiet" style={{ alignSelf: "center" }} onPress={onToggleTranscript}>
          <MessageSquare size={18} color={colors.accent} />
        </Button> : null}
    </View>
  ) : null;
  // Without a live call the toggles control nothing: idle and asleep show one Talk button instead of a dock.
  const idle = call.phase === "idle" && !pending && !reconnecting;
  const orbSize = transcriptVisible
    ? Math.max(72, Math.min(112, viewport.height * 0.14))
    // A landscape tablet is short: at 42% of its height the orb pushed the failure card and Try again
    // below the dock, so a wide screen gives the orb less of its height.
    : Math.max(160, Math.min(340, viewport.width - space.xxl * 2, viewport.height * (viewport.width > viewport.height ? 0.28 : 0.42)));
  const iconOn = colors.text, iconSelected = colors.background;
  // One turn control: Send now while the owner speaks, Stop speaking while the reply plays. They never apply at once.
  const replyPlaying = call.phase === "speaking";
  const canSend = recording && !call.muted;
  const talk = <View style={{ alignSelf: "center", width: "100%", maxWidth: 520 }}>
    <Button label={call.error ? copy("Yeniden dene", "Try again") : copy("Konuş", "Talk")} tone="primary" fullWidth disabled={!ready} onPress={onStart}>
      {call.error ? <RotateCcw size={18} color={colors.primaryText} /> : <AudioLines size={18} color={colors.primaryText} />}
    </Button>
  </View>;
  const dock = !active ? null : idle ? <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>{talk}</View>
    : <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: space.xl, rowGap: space.md, paddingHorizontal: space.lg, paddingTop: space.md }}>
    {/* Connecting and reconnecting have nothing to mute yet: one control cancels them, as on the desktop. */}
    {connecting || reconnecting ? null : <>
    <CallControl label={call.muted ? copy("Sesi aç", "Unmute") : copy("Sessize al", "Mute")} selected={call.muted} disabled={!live}
      accessibilityLabel={call.muted ? copy("Mikrofonu aç", "Unmute microphone") : copy("Mikrofonu kapat", "Mute microphone")}
      onPress={() => muteAssistantCall(!call.muted)}>
      {call.muted ? <MicOff size={26} color={iconSelected} /> : <Mic size={26} color={iconOn} />}
    </CallControl>
    <CallControl label={replyPlaying ? copy("Konuşmayı durdur", "Stop speaking") : copy("Şimdi gönder", "Send now")}
      disabled={!replyPlaying && !canSend}
      accessibilityLabel={replyPlaying ? copy("Yanıtı durdur ve tekrar dinle", "Stop the reply and listen again") : copy("Söylediklerini şimdi gönder", "Send what you said now")}
      onPress={() => { if (replyPlaying) silenceAssistantCall(); else finishAssistantCallTurn(); }}>
      {replyPlaying ? <SkipForward size={26} color={iconOn} /> : <Send size={24} color={iconOn} />}
    </CallControl>
    <CallControl label={call.speakerMuted ? copy("Hoparlörü aç", "Speaker on") : copy("Hoparlörü kapat", "Speaker off")} selected={call.speakerMuted} disabled={!live}
      accessibilityLabel={call.speakerMuted ? copy("Hoparlörü aç", "Unmute speaker") : copy("Hoparlörü sustur", "Mute speaker")}
      onPress={() => setAssistantCallSpeakerMuted(!call.speakerMuted)}>
      {call.speakerMuted ? <VolumeX size={26} color={iconSelected} /> : <Volume2 size={26} color={iconOn} />}
    </CallControl>
    </>}
    <CallControl label={reconnecting ? copy("Durdur", "Stop") : connecting ? copy("İptal", "Cancel") : copy("Bitir", "End")}
      accessibilityLabel={reconnecting ? copy("Yeniden bağlanmayı durdur", "Stop reconnecting") : connecting ? copy("Görüşmeyi iptal et", "Cancel voice call") : copy("Görüşmeyi bitir", "End voice call")} danger onPress={onEnd}>
      <PhoneOff size={26} color={colors.primaryText} />
    </CallControl>
  </View>;
  const speakerPicture = connecting ? <View style={{ paddingLeft: space.sm }}><BusyIndicator size="sm" color={colors.text} /></View>
    : ownerTurn ? owner ? <AssistantOwnerAvatar owner={owner} size="sm" /> : null : avatar ? <AssistantAvatar value={avatar} size={32} /> : null;
  const speaker = <View style={{ flexDirection: "row", alignItems: "center", alignSelf: "center", maxWidth: "100%", gap: space.sm, minHeight: 40, paddingVertical: space.xs, paddingLeft: speakerPicture ? space.xs : space.lg, paddingRight: space.lg, borderRadius: radii.pill, backgroundColor: colors.glass }}>
    {speakerPicture}
    {/* Keyed by the status: Android laid a changed status ("Listening" → "Waiting for reply") at the old
        text's measured width and clipped the wrapped word ("Waiting for"). */}
    <Body key={status} selectable={false} style={[uiStyles.buttonLabel, { flexShrink: 1 }]} accessibilityLiveRegion="polite">{status}</Body>
  </View>;
  return <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.background }}>
    {active || stage ? <AssistantVoiceBackdrop state={active ? state : "idle"} /> : null}
    <View style={{ flex: 1, minHeight: 0, paddingTop: active || stage ? insets.top : 0, paddingLeft: active || stage ? insets.left : 0, paddingRight: active || stage ? insets.right : 0 }}>
    <SessionKeyboardFrame transparent={active || stage} composer={<>
      <View style={{ display: chatVisible ? "flex" : "none" }} accessibilityElementsHidden={!chatVisible} importantForAccessibility={chatVisible ? "auto" : "no-hide-descendants"}>{composer}</View>
      {dock}
    </>}>
      {/* The home stage draws its own bar so the light runs to the top edge instead of under an opaque header. */}
      {stage && !active ? <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.sm, paddingVertical: space.xs }}>
        <HeaderBackButton onPress={onBack ?? onMinimize} />
        {/* No call runs on the home, so there is nothing to minimize: Back and the assistant's settings. */}
        <View style={{ flexDirection: "row", alignItems: "center" }}>{settings}</View>
      </View> : null}
      {active ? <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm, paddingVertical: space.xs }}>
        {/* With no call running there is nothing to keep in a floating window: Back leaves the call screen. */}
        {idle ? <HeaderBackButton onPress={onEnd} />
          : <IconButton label={copy("Asistanı küçült", "Minimize assistant")} onPress={onMinimize}><ChevronDown size={iconSize.back} color={colors.text} /></IconButton>}
        <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm }}>
          <AssistantAvatar value={avatar} size={36} />
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Body numberOfLines={1} style={uiStyles.heading}>{name}</Body>
            <ScopeLine scope={scope} />
          </View>
        </View>
        {settings ?? <CallVoiceButton />}
        <IconButton label={transcriptVisible ? copy("Sohbeti gizle", "Hide chat") : copy("Sohbeti göster", "Show chat")} expanded={transcriptVisible}
          onPress={() => { if (transcriptVisible) Keyboard.dismiss(); onToggleTranscript(); }}>
          <MessageSquare size={iconSize.action} color={transcriptVisible ? colors.accent : colors.text} />
        </IconButton>
      </View> : null}
      {active && transcriptVisible ? <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        <AssistantCallOrb state={state} size={orbSize} label={status} />
        <View style={{ flex: 1, minWidth: 0, alignItems: "flex-start", gap: space.xs }}>
          {speaker}
          {caption ? <Body numberOfLines={2} muted>{caption}</Body> : recording ? <AssistantRecordingHint manual={manualTurnEnd} centered={false} /> : null}
        </View>
      </View> : null}
      {active && transcriptVisible && callFailure ? (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
          {callFailure}
        </View>
      ) : null}
      {active && !transcriptVisible ? <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", gap: space.lg, paddingHorizontal: space.xl, paddingVertical: space.lg }}>
        <AssistantCallOrb state={state} size={orbSize} label={status} />
        {speaker}
        {caption ? <Body numberOfLines={4} style={[uiStyles.body, { textAlign: "center", maxWidth: 520 }]}>{caption}</Body>
          : connecting ? <Body muted style={{ textAlign: "center", maxWidth: 420 }}>{copy("Mikrofon ve bilgisayarınla ses bağlantısı hazırlanıyor.", "Getting the microphone and the voice line to your computer ready.")}</Body>
          : preparing ? <Body muted style={{ textAlign: "center", maxWidth: 420 }}>{copy("Ses modeli yükleniyor; dinleme başlayınca konuşun.", "The speech model is loading; speak once listening starts.")}</Body>
          : recording ? <AssistantRecordingHint manual={manualTurnEnd} centered /> : null}
        {/* Centred column: a stretched view with a max width stuck to the left edge on tablets. */}
        <View style={{ alignSelf: "center", width: "100%", maxWidth: 520, gap: space.sm }}>
          {callFailure}
          {feedback}
        </View>
      </ScrollView> : null}
      {/* Concealing chrome never unmounts the transcript, editor or its draft owner. */}
      <View style={{ flex: chatVisible ? 1 : 0, minHeight: 0, display: chatVisible ? "flex" : "none" }} accessibilityElementsHidden={!chatVisible} importantForAccessibility={chatVisible ? "auto" : "no-hide-descendants"}>
        {children}
      </View>
    </SessionKeyboardFrame>
    </View>
  </View>;
}
