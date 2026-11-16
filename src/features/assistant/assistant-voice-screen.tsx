import type { PropsWithChildren, ReactNode } from "react";
import { Keyboard, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Mic from "lucide-react-native/icons/mic";
import MicOff from "lucide-react-native/icons/mic-off";
import MessageSquare from "lucide-react-native/icons/message-square";
import Minimize2 from "lucide-react-native/icons/minimize-2";
import PhoneOff from "lucide-react-native/icons/phone-off";
import { Body, Button, Disclosure, IconButton } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { metrics, space } from "@/ui/tokens";
import { useAssistantCall } from "./assistant-call-state";
import { muteAssistantCall } from "./assistant-call-session";
import { AssistantOrb } from "./assistant-orb";
import { assistantOrbState } from "./assistant-voice-presentation";
import { SessionKeyboardFrame } from "../workspace/session-keyboard-frame";

export function AssistantVoiceScreen({ active, name, scope, avatar, transcriptVisible, pending, ready, composer, feedback, onToggleTranscript, onMinimize, onEnd, onStart, children }: PropsWithChildren<{
  active: boolean;
  composer: ReactNode; feedback?: ReactNode;
  name: string; scope: string; avatar?: string; transcriptVisible: boolean; pending: boolean; ready: boolean;
  onToggleTranscript(): void; onMinimize(): void; onEnd(): void; onStart(): void;
}>) {
  const copy = useCopy(), { colors, uiStyles } = useMobileTheme(), insets = useSafeAreaInsets();
  const call = useAssistantCall(), viewport = useWindowDimensions();
  const state = assistantOrbState(call.phase, call.muted, call.error);
  const status = state === "error" ? copy("Görüşme durdu", "Call stopped")
    : state === "muted" ? copy("Mikrofon kapalı", "Microphone muted")
    : state === "listening" ? copy("Dinleniyor", "Listening")
    : state === "speaking" ? copy("Sesli yanıt", "Speaking")
    : state === "thinking" || pending ? copy("Yanıt bekleniyor", "Waiting for reply")
    : copy("Sesli görüşme", "Voice call");
  const size = Math.max(64, Math.min(transcriptVisible ? 112 : 280, viewport.width - space.xxl * 2, viewport.height * (transcriptVisible ? 0.17 : 0.4)));
  const controls = active ? <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md }}>
      <View style={{ width: metrics.touchTarget, minHeight: metrics.touchTarget, justifyContent: "center", alignItems: "center" }}>
        <IconButton label={call.muted ? copy("Mikrofonu aç", "Unmute microphone") : copy("Mikrofonu kapat", "Mute microphone")} disabled={call.phase === "idle" || call.phase === "starting"} onPress={() => muteAssistantCall(!call.muted)}>
          {call.muted ? <MicOff size={24} color={colors.warning} /> : <Mic size={24} color={colors.text} />}
        </IconButton>
      </View>
      <View style={{ width: metrics.touchTarget, minHeight: metrics.touchTarget, justifyContent: "center", alignItems: "center" }}>
        <IconButton label={transcriptVisible ? copy("Sohbeti gizle", "Hide chat") : copy("Sohbeti göster", "Show chat")} expanded={transcriptVisible} onPress={() => { if (transcriptVisible) Keyboard.dismiss(); onToggleTranscript(); }}>
          <MessageSquare size={24} color={transcriptVisible ? colors.accent : colors.text} />
        </IconButton>
      </View>
      <View style={{ width: metrics.touchTarget, minHeight: metrics.touchTarget, justifyContent: "center", alignItems: "center" }}>
        <IconButton label={copy("Asistanı küçült", "Minimize assistant")} onPress={onMinimize}><Minimize2 size={24} color={colors.text} /></IconButton>
      </View>
      <View style={{ minWidth: metrics.touchTarget, minHeight: metrics.touchTarget, justifyContent: "center" }}>
        <Button label={copy("Bitir", "End")} accessibilityLabel={copy("Görüşmeyi bitir", "End voice call")} tone="danger" onPress={onEnd}>
          <PhoneOff size={20} color={colors.danger} />
        </Button>
      </View>
    </View> : null;
  const chatVisible = !active || transcriptVisible;
  return <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.background, paddingTop: active ? insets.top : 0, paddingLeft: active ? insets.left : 0, paddingRight: active ? insets.right : 0 }}>
    <SessionKeyboardFrame composer={<>
      <View style={{ display: chatVisible ? "flex" : "none" }} accessibilityElementsHidden={!chatVisible} importantForAccessibility={chatVisible ? "auto" : "no-hide-descendants"}>{composer}</View>
      {controls}
    </>}>
      {active ? <ScrollView style={{ flex: transcriptVisible ? 0 : 1, flexShrink: 1, maxHeight: transcriptVisible ? viewport.height * 0.35 : undefined }} contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg, paddingVertical: space.md }}>
        <Body style={uiStyles.heading}>{name}</Body>
        <Body muted style={uiStyles.caption}>{scope}</Body>
        <AssistantOrb state={pending && call.phase === "idle" && !call.error ? "thinking" : state} level={call.level} size={size} avatar={avatar} />
        <Body style={uiStyles.buttonLabel}>{status}</Body>
        <View style={{ alignSelf: "stretch" }}>
          {call.error ? <Disclosure label={copy("Sesli görüşme kullanılamıyor", "Voice call unavailable")}>
            <Body muted>{call.error instanceof Error ? call.error.message : String(call.error)}</Body>
          </Disclosure> : null}
          {!transcriptVisible ? feedback : null}
        </View>
        {call.phase === "idle" && !pending ? <Button label={copy("Sesli görüşme", "Voice call")} disabled={!ready} tone="quiet" onPress={onStart} /> : null}
      </ScrollView> : null}
      {/* Concealing chrome never unmounts the transcript, editor or its draft owner. */}
      <View style={{ flex: chatVisible ? 1 : 0, minHeight: 0, display: chatVisible ? "flex" : "none" }} accessibilityElementsHidden={!chatVisible} importantForAccessibility={chatVisible ? "auto" : "no-hide-descendants"}>
        {children}
      </View>
    </SessionKeyboardFrame>
  </View>;
}
