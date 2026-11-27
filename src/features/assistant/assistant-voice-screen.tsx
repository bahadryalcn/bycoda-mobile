import type { ComponentProps, PropsWithChildren, ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { Keyboard, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AudioLines from "lucide-react-native/icons/audio-lines";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import KeyboardIcon from "lucide-react-native/icons/keyboard";
import KeyboardOff from "lucide-react-native/icons/keyboard-off";
import Mic from "lucide-react-native/icons/mic";
import MicOff from "lucide-react-native/icons/mic-off";
import MessageSquare from "lucide-react-native/icons/message-square";
import Square from "lucide-react-native/icons/square";
import PhoneOff from "lucide-react-native/icons/phone-off";
import RotateCcw from "lucide-react-native/icons/rotate-ccw";
import Send from "lucide-react-native/icons/send";
import Volume2 from "lucide-react-native/icons/volume-2";
import VolumeX from "lucide-react-native/icons/volume-x";
import { Body, Button, HeaderBackButton, IconButton, Notice, type PageScope } from "@/ui/primitives";
import { fitsHeaderRow } from "@/ui/layout";
import { CallControl } from "@/ui/call-control";
import { ScopePills } from "@/ui/scope-line";
import { useCopy } from "@/ui/copy";
import { BusyIndicator } from "@/ui/busy-indicator";
import { useMobileTheme } from "@/ui/theme";
import { iconSize, opacity, radii, space } from "@/ui/tokens";
import { useAssistantCall } from "./assistant-call-state";
import { useAssistantCallEpisode } from "./assistant-call-episode";
import { AssistantCallError } from "./assistant-call-error";
import { assistantVoiceErrorMessage } from "./assistant-voice-error";
import { finishAssistantCallTurn, muteAssistantCall, setAssistantCallSpeakerMuted, silenceAssistantCall } from "./assistant-call-session";
import { AssistantVoiceBackdrop, AssistantVoiceOrb } from "./assistant-voice-stage";
import { assistantOrbState, assistantVoiceFailureTitle, assistantVoiceStageLabel } from "./assistant-voice-presentation";
import { SessionKeyboardFrame } from "../workspace/session-keyboard-frame";
import { isMicrophoneDenied, MicrophonePermissionNotice } from "../voice-settings/microphone-permission-notice";
import { AssistantSettingsButton } from "../voice-settings/call-voice-button";
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
    : manual ? copy("Bitirdiğinde Gönder’e dokun.", "Tap Send when you are done.")
    : copy("Doğal konuş. Durduğunda sözlerin gönderilir.", "Speak naturally. When you pause, your words are sent.")}</Body>;
}

/**
 * A realtime call on an up-to-date computer whose phone lacks echo cancellation: speaking over a reply
 * does not stop it, so the call says quietly under the status that a tap does.
 */
function AssistantTapToInterruptHint({ centered }: { centered: boolean }) {
  const copy = useCopy();
  return <Body muted style={{ textAlign: centered ? "center" : "left", maxWidth: 420 }}>
    {copy("Kesmek için dokun.", "Tap to interrupt.")}
  </Body>;
}

/**
 * The full-screen voice call: a coloured stage and a large orb that react to the call, who is talking
 * (in words; no pictures), the words in flight, and a phone-style control dock.
 * The orb stays large in the centre until the owner opens the chat (header), which shrinks the stage to a
 * strip; "Write" in the dock opens only the composer above it. Both start closed for every call, and the
 * transcript and composer stay mounted throughout.
 */
export function AssistantVoiceScreen({ active, stage = false, name, computer, scope, scopeControl, transcriptVisible, composerVisible = false, pending, ready, composer, feedback, unavailable, settings, actions, onToggleTranscript, onToggleComposer, onMinimize, onEnd, onStart, onBack, children }: PropsWithChildren<{
  active: boolean;
  /** The assistant's home sits on the same calm stage, so starting a call only wakes it up. */
  stage?: boolean;
  composer: ReactNode; feedback?: ReactNode; settings?: ReactNode;
  /** Why a call cannot start now (assistant off, no access, computer needs an update); shown instead of Connecting. */
  unavailable?: ReactNode;
  /** Header actions of the home stage beside its settings, such as recent conversations. */
  actions?: ReactNode;
  /** The connected computer that transcribes and voices the call. */
  computer: string;
  /** Which computer (and project) the call works in, as the shared scope line. */
  name: string; scope: PageScope; transcriptVisible: boolean; pending: boolean; ready: boolean;
  /** The conversation's own scope selector (General or a project), after the computer pill. */
  scopeControl?: ReactNode;
  /** The call's text composer, opened from "Write" in the dock. */
  composerVisible?: boolean; onToggleComposer?(): void;
  onToggleTranscript(): void; onMinimize(): void; onEnd(): void; onStart(): void;
  /** Leaves the home stage, which hides the native header to draw its own over the light. */
  onBack?(): void;
}>) {
  const copy = useCopy(), { colors, uiStyles } = useMobileTheme(), insets = useSafeAreaInsets();
  const call = useAssistantCall(useShallow(({ phase, capture, error, muted, speakerMuted, stage, utterance, lastReply }) =>
    ({ phase, capture, error, muted, speakerMuted, stage, utterance, lastReply })));
  const sleep = useAssistantCall(useShallow(({ asleep, reconnecting }) => ({ asleep, reconnecting })));
  const typingUnavailable = useAssistantCall(call => !!call.typingUnavailable);
  const spokenInterrupt = useAssistantCall(call => call.spokenInterrupt);
  const manualTurnEnd = useVoicePreferences().preferences.manualTurnEnd;
  const viewport = useWindowDimensions();
  const lastUtterance = useAssistantCallEpisode()?.lastUtterance;
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
    : asleep ? copy("Sessizlik nedeniyle duraklatıldı", "Paused after silence")
    : unavailable ? copy("Sesli görüşme kullanılamıyor", "Voice call unavailable")
    : copy("Bağlanmaya hazır", "Ready to connect");
  // Only a live realtime call on a v2 relay whose phone lacks echo cancellation sets it false; others never set it.
  const tapToInterrupt = live && !call.error && spokenInterrupt === false;
  const caption = call.phase === "sending" ? call.utterance : call.phase === "speaking" ? call.lastReply : undefined;
  const chatVisible = !active || transcriptVisible;
  // A stopped call keeps the owner's last words in view, muted under the cause, instead of a composer.
  const failedWords = call.error && lastUtterance ? `“${lastUtterance}”` : undefined;
  // A permanently denied microphone needs the system Settings page, not another call attempt.
  // The stopped step and its cause stay in view: a folded failure left only "Call stopped" on screen.
  // The shared warning notice: what stopped, in words, then the cause (folded behind Details when long).
  // "Check the previous message" needs the conversation, where its status check lives; its action opens it.
  const callFailure = isMicrophoneDenied(call.error) ? <MicrophonePermissionNotice /> : call.error ? (
    <Notice tone="warning"
      message={`${assistantVoiceFailureTitle(call.stage, computer, copy)}. ${assistantVoiceErrorMessage(call.error, copy, { stage: call.stage, computer })}`}
      action={call.error instanceof AssistantCallError && (call.error.reason === "send-unreviewed" || call.error.reason === "result-unknown") && !transcriptVisible
        ? { label: copy("Sohbeti göster", "Show chat"), onPress: onToggleTranscript } : undefined} />
  ) : call.phase === "idle" && !pending && !reconnecting && unavailable ? unavailable : null;
  // Without a live call the toggles control nothing: idle and asleep show one Talk button instead of a dock.
  const idle = call.phase === "idle" && !pending && !reconnecting;
  // Typing is the owner's choice during a live call; a stopped or idle call offers only Talk or Try again.
  const composerShown = !active || (composerVisible && live && !call.error);
  const orbSize = transcriptVisible
    ? Math.max(72, Math.min(112, viewport.height * 0.14))
    // An open composer (and its keyboard) shares the height: the orb stays centred, at a smaller size.
    : active && composerShown ? Math.max(120, Math.min(220, viewport.width - space.xxl * 2, viewport.height * 0.24))
    // A landscape tablet is short: at 42% of its height the orb pushed the failure card and Try again
    // below the dock, so a wide screen gives the orb less of its height.
    : Math.max(160, Math.min(340, viewport.width - space.xxl * 2, viewport.height * (viewport.width > viewport.height ? 0.28 : 0.42)));
  const iconOn = colors.text, iconSelected = colors.background;
  // One turn control, shown only when it does something the owner chose: Stop while a reply plays, and
  // Send while the owner speaks with "I decide when my turn ends". Otherwise a pause sends on its own.
  const replyPlaying = call.phase === "speaking";
  const canSend = recording && !call.muted;
  const turnControl = replyPlaying ? "stop" : manualTurnEnd ? "send" : undefined;
  const talk = <View style={{ alignSelf: "center", width: "100%", maxWidth: 520 }}>
    <Button label={call.error ? copy("Yeniden dene", "Try again") : copy("Konuş", "Talk")} tone="primary" fullWidth disabled={!ready} onPress={onStart}>
      {call.error ? <RotateCcw size={18} color={colors.primaryText} /> : <AudioLines size={18} color={colors.primaryText} />}
    </Button>
  </View>;
  // One row at every width: short labels under fixed slots, never wrapped onto a second line of controls.
  const dock = !active ? null : idle ? <View style={{ paddingHorizontal: space.lg, paddingTop: space.md }}>{talk}</View>
    : <View style={{ flexDirection: "row", justifyContent: "space-evenly", alignItems: "flex-start", paddingHorizontal: space.sm, paddingTop: space.md }}>
    {/* Connecting and reconnecting have nothing to mute yet: one control cancels them, as on the desktop. */}
    {connecting || reconnecting ? null : <>
    <CallControl label={copy("Mikrofon", "Microphone")} selected={call.muted} disabled={!live}
      accessibilityLabel={call.muted ? copy("Mikrofonu aç", "Unmute microphone") : copy("Mikrofonu kapat", "Mute microphone")}
      onPress={() => muteAssistantCall(!call.muted)}>
      {call.muted ? <MicOff size={26} color={iconSelected} /> : <Mic size={26} color={iconOn} />}
    </CallControl>
    {turnControl ? <CallControl label={turnControl === "stop" ? copy("Kes", "Interrupt") : copy("Gönder", "Send")}
      disabled={turnControl === "send" && !canSend}
      accessibilityLabel={turnControl === "stop" ? copy("Yanıtı durdur ve tekrar dinle", "Stop the reply and listen again") : copy("Söylediklerini şimdi gönder", "Send what you said now")}
      onPress={() => { if (turnControl === "stop") silenceAssistantCall(); else finishAssistantCallTurn(); }}>
      {turnControl === "stop" ? <Square size={24} color={iconOn} /> : <Send size={24} color={iconOn} />}
    </CallControl> : null}
    {onToggleComposer && !typingUnavailable ? <CallControl label={copy("Yaz", "Write")} disabled={!live}
      accessibilityLabel={composerVisible ? copy("Yazma alanını kapat", "Close the message field") : copy("Mesaj yaz", "Write a message")}
      onPress={() => { if (composerVisible) Keyboard.dismiss(); onToggleComposer(); }}>
      {composerVisible ? <KeyboardOff size={26} color={iconOn} /> : <KeyboardIcon size={26} color={iconOn} />}
    </CallControl> : null}
    <CallControl label={copy("Hoparlör", "Speaker")} selected={call.speakerMuted} disabled={!live}
      accessibilityLabel={call.speakerMuted ? copy("Hoparlörü aç", "Unmute speaker") : copy("Hoparlörü sustur", "Mute speaker")}
      onPress={() => setAssistantCallSpeakerMuted(!call.speakerMuted)}>
      {call.speakerMuted ? <VolumeX size={26} color={iconSelected} /> : <Volume2 size={26} color={iconOn} />}
    </CallControl>
    </>}
    <CallControl label={reconnecting || connecting ? copy("İptal", "Cancel") : copy("Bitir", "End")}
      accessibilityLabel={reconnecting ? copy("Yeniden bağlanmayı durdur", "Stop reconnecting") : connecting ? copy("Görüşmeyi iptal et", "Cancel voice call") : copy("Görüşmeyi bitir", "End voice call")} danger onPress={onEnd}>
      <PhoneOff size={26} color={colors.primaryText} />
    </CallControl>
  </View>;
  const speakerPicture = connecting ? <View style={{ paddingLeft: space.sm }}><BusyIndicator size="sm" color={colors.text} /></View> : null;
  // Centred under the large orb; beside the small one it lines up with the words under it.
  const speaker = (align: "center" | "flex-start") => <View style={{ flexDirection: "row", alignItems: "center", alignSelf: align, maxWidth: "100%", gap: space.sm, minHeight: 40, paddingVertical: space.xs, paddingLeft: speakerPicture ? space.xs : space.lg, paddingRight: space.lg, borderRadius: radii.pill, backgroundColor: colors.glass }}>
    {speakerPicture}
    {/* Keyed by the status: Android laid a changed status ("Listening" → "Waiting for reply") at the old
        text's measured width and clipped the wrapped word ("Waiting for"). */}
    <Body key={status} selectable={false} style={[uiStyles.buttonLabel, { flexShrink: 1 }]} accessibilityLiveRegion="polite">{status}</Body>
  </View>;
  // The shared heading rule: the scope pills share the row while the name keeps its words, else they
  // take a compact row below it (narrow phones, large text), never clipping the name.
  const pillCount = (scope.computer ? 1 : 0) + (scope.project ? 1 : 0) + (scopeControl ? 1 : 0);
  const pills = <><ScopePills scope={scope} />{scopeControl}</>;
  const pillsInRow = fitsHeaderRow({ width: viewport.width, fontScale: viewport.fontScale, title: name, pills: pillCount, actions: 2 });
  const topRow = (leading: ReactNode, trailing: ReactNode) => <View>
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xs }}>
      {leading}
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Body numberOfLines={1} accessibilityRole="header" style={[uiStyles.heading, { flexShrink: 1 }]}>{name}</Body>
        {pillsInRow ? pills : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>{trailing}</View>
    </View>
    {!pillsInRow && pillCount ? <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.xs }}>{pills}</View> : null}
  </View>;
  return <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.background }}>
    {active || stage ? <AssistantVoiceBackdrop state={active ? state : "idle"} /> : null}
    <View style={{ flex: 1, minHeight: 0, paddingTop: active || stage ? insets.top : 0, paddingLeft: active || stage ? insets.left : 0, paddingRight: active || stage ? insets.right : 0 }}>
    <SessionKeyboardFrame transparent={active || stage} composer={<>
      <View style={{ display: composerShown ? "flex" : "none" }} accessibilityElementsHidden={!composerShown} importantForAccessibility={composerShown ? "auto" : "no-hide-descendants"}>{composer}</View>
      {dock}
    </>}>
      {/* The home stage draws its own bar so the light runs to the top edge instead of under an opaque header.
          Home and call share one top row: Back (or Minimize), the left-aligned name with the scope pills,
          then the icon actions, so starting a call never moves the name. */}
      {stage && !active ? topRow(<HeaderBackButton onPress={onBack ?? onMinimize} />, <>{actions}{settings}</>) : null}
      {active ? topRow(
        // With no call running there is nothing to keep in a floating window: Back leaves the call screen.
        idle ? <HeaderBackButton onPress={onEnd} />
          : <IconButton label={copy("Asistanı küçült", "Minimize assistant")} onPress={onMinimize}><ChevronDown size={iconSize.back} color={colors.text} /></IconButton>,
        <>
          {settings ?? <AssistantSettingsButton />}
          <IconButton label={transcriptVisible ? copy("Sohbeti gizle", "Hide chat") : copy("Sohbeti göster", "Show chat")} expanded={transcriptVisible}
            onPress={() => { if (transcriptVisible) Keyboard.dismiss(); onToggleTranscript(); }}>
            <MessageSquare size={iconSize.action} color={transcriptVisible ? colors.accent : colors.text} />
          </IconButton>
        </>) : null}
      {active && transcriptVisible ? <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.sm }}>
        <View style={{ opacity: state === "error" ? opacity.disabled : 1 }}><AssistantCallOrb state={state} size={orbSize} /></View>
        <View style={{ flex: 1, minWidth: 0, alignItems: "flex-start", gap: space.xs }}>
          {speaker("flex-start")}
          {caption ? <Body numberOfLines={2} muted>{caption}</Body> : recording ? <AssistantRecordingHint manual={manualTurnEnd} centered={false} />
            : failedWords ? <Body numberOfLines={2} muted>{failedWords}</Body> : null}
          {tapToInterrupt ? <AssistantTapToInterruptHint centered={false} /> : null}
        </View>
      </View> : null}
      {/* Waiting questions and operation errors stay in view with the chat open, under the call strip. */}
      {active && transcriptVisible && (callFailure || feedback) ? (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm }}>
          {callFailure}
          {feedback}
        </View>
      ) : null}
      {active && !transcriptVisible ? <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", gap: space.lg, paddingHorizontal: space.xl, paddingVertical: space.lg }}>
        {/* A stopped call dims its orb: nothing listens or speaks until Try again. */}
        <View style={{ opacity: state === "error" ? opacity.disabled : 1 }}><AssistantCallOrb state={state} size={orbSize} /></View>
        {speaker("center")}
        {asleep ? <Body muted style={{ textAlign: "center", maxWidth: 420 }}>{copy("Devam etmek için Konuş’a dokun.", "Tap Talk to continue.")}</Body> : null}
        {failedWords ? <Body muted numberOfLines={3} style={{ textAlign: "center", maxWidth: 420 }}>{failedWords}</Body> : null}
        {caption ? <Body numberOfLines={4} style={[uiStyles.body, { textAlign: "center", maxWidth: 520 }]}>{caption}</Body>
          : connecting ? <Body muted style={{ textAlign: "center", maxWidth: 420 }}>{copy("Mikrofon ve bilgisayarınla ses bağlantısı hazırlanıyor.", "Getting the microphone and the voice line to your computer ready.")}</Body>
          : preparing ? <Body muted style={{ textAlign: "center", maxWidth: 420 }}>{copy("Ses modeli yükleniyor; dinleme başlayınca konuş.", "The speech model is loading; speak once listening starts.")}</Body>
          : recording ? <AssistantRecordingHint manual={manualTurnEnd} centered /> : null}
        {tapToInterrupt ? <AssistantTapToInterruptHint centered /> : null}
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
