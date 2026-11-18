import { useEffect, type PropsWithChildren } from "react";
import { View } from "react-native";
import { router, usePathname } from "expo-router";
import Minimize2 from "lucide-react-native/icons/minimize-2";
import { IconButton } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { useBottomChromeClearance } from "@/ui/provider";
import { useActiveMachine } from "@/state/machines";
import { useSecurity } from "@/state/security";
import { useConnectionScope } from "@/state/connection-scope";
import { useHostClient } from "@/state/queries";
import { useLocalDraftEpoch } from "@/state/use-local-draft-epoch";
import { pendingSpeechKey } from "./assistant-speech-draft";
import { bindAssistantVoicePort, cancelAssistantVoice, closeAssistantCompanion, hydrateAssistantSpeech, interruptAssistantVoice, minimizeAssistantCompanion, openAssistantCompanion, useAssistantCompanion } from "./assistant-companion-state";
import { AssistantFloatingWindow } from "./assistant-floating-window";
import { useAssistantCall } from "./assistant-call-state";
import { assistantCallInBackground, endAssistantCall, muteAssistantCall, pictureInPictureAssistant } from "./assistant-call-session";
import { assistantOrbState } from "./assistant-voice-presentation";

export function AssistantMinimizeButton() {
  const copy = useCopy(), { colors } = useMobileTheme();
  return <IconButton label={copy("Asistanı küçült", "Minimize assistant")} onPress={() => {
    minimizeAssistantCompanion();
    if (router.canGoBack()) router.back(); else router.replace("/");
  }}><Minimize2 size={20} color={colors.text} /></IconButton>;
}

/** One movable companion survives route changes; explicit native calls own background audio. */
export function AssistantCompanion({ children }: PropsWithChildren) {
  const copy = useCopy();
  const state = useAssistantCompanion(), machine = useActiveMachine(), pathname = usePathname();
  const call = useAssistantCall();
  const bottomClearance = useBottomChromeClearance();
  const security = useSecurity();
  const connection = useConnectionScope(), transport = useHostClient();
  const speechEpoch = useLocalDraftEpoch(pendingSpeechKey);
  // Restore recognized text before another recording can replace the pending recovery record.
  useEffect(() => { void hydrateAssistantSpeech().catch(() => {}); }, [speechEpoch]);
  // This shell outlives minimized routes; each voice action captures this issued connection epoch.
  useEffect(() => {
    if (!transport || !connection.review) return;
    return bindAssistantVoicePort({ machineId: connection.review.id, environmentId: connection.review.environmentId, port: {
      current: () => connection.isCurrent() && useSecurity.getState().status === "unlocked" && useSecurity.getState().appState === "active" && useSecurity.getState().windowFocused,
      request: (method, params, options) => transport.request(method, params, options),
    } });
  }, [transport, connection]);
  const matches = machine?.id === state.machineId && machine?.environmentId === state.environmentId;
  // Lock, lost computer identity, background and consent unmount must release native capture.
  // A running call outlives the app lock; its chrome reappears after unlocking.
  useEffect(() => {
    if (!matches || (security.status !== "unlocked" && !assistantCallInBackground())) closeAssistantCompanion();
    else if ((security.appState !== "active" || !security.windowFocused) && !assistantCallInBackground()) interruptAssistantVoice();
  }, [security.status, security.appState, security.windowFocused, matches]);
  // Route Back keeps the same Room thread available through the floating window.
  useEffect(() => {
    if (state.mode === "full" && pathname !== "/assistant") minimizeAssistantCompanion();
  }, [pathname, state.mode]);
  // The access gate owns this lifetime, including consent withdrawal and sign-out.
  useEffect(() => () => { cancelAssistantVoice(); endAssistantCall(); }, []);
  const minimized = matches && state.mode === "minimized" && security.status === "unlocked";
  const status = state.voice === "recording" ? copy("Dinleniyor", "Listening")
    : state.voice === "transcribing" ? copy("Yazıya çevriliyor", "Transcribing")
    : state.voice === "speaking" ? copy("Sesli yanıt", "Speaking")
    : state.voice === "preparing" ? copy("Ses hazırlanıyor", "Preparing voice") : copy("Asistan", "Assistant");
  const callActive = call.phase !== "idle";
  const callStatus = call.error ? copy("Görüşme durdu", "Call stopped") : call.phase === "listening" ? copy("Dinleniyor", "Listening")
    : call.phase === "sending" ? copy("Yanıt bekleniyor", "Waiting for reply")
    : call.phase === "speaking" ? copy("Sesli yanıt", "Speaking")
    : call.phase === "muted" ? copy("Mikrofon kapalı", "Microphone muted")
    : copy("Ses hazırlanıyor", "Preparing voice");
  return <View style={{ flex: 1 }}>
    <View style={{ flex: 1 }}>{children}</View>
    {minimized ? <AssistantFloatingWindow title={copy("Asistan", "Assistant")}
      bottomInset={bottomClearance}
      status={callActive || call.error ? callStatus : status} active={callActive || state.voice !== "idle"} muted={call.muted}
      orbState={callActive || call.error ? assistantOrbState(call.phase, call.muted, call.error)
        : state.error ? "error" : state.voice === "recording" ? "listening" : state.voice === "speaking" ? "speaking" : state.voice === "idle" ? "idle" : "thinking"} level={call.level}
      onExpand={() => {
        if (callActive && call.thread) useAssistantCompanion.setState({ thread: call.thread, projectId: call.thread.projectId ?? "" });
        openAssistantCompanion(state.machineId, state.environmentId); router.navigate("/assistant");
      }}
      onClose={() => { endAssistantCall(); closeAssistantCompanion(); }}
      onMute={callActive ? () => muteAssistantCall(!call.muted) : undefined}
      onPip={callActive ? () => { void pictureInPictureAssistant().catch(error => useAssistantCall.setState({ error })); } : undefined}
    /> : null}
  </View>;
}
