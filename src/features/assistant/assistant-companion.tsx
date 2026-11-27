import { useEffect, type PropsWithChildren } from "react";
import { View } from "react-native";
import { router, usePathname } from "expo-router";
import { useShallow } from "zustand/react/shallow";
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
import { assistantPictureInPictureSupported } from "./assistant-platform";
import { goBack } from "@/ui/navigation";

/** True while something keeps running when the assistant leaves the screen: a call, a reconnect, dictation or read-aloud. */
export function useAssistantVoiceBusy() {
  const call = useAssistantCall(state => state.phase !== "idle" || !!state.reconnecting);
  const voice = useAssistantCompanion(state => state.voice !== "idle");
  return call || voice;
}

/** Minimize keeps a running call or recording in the floating window; with nothing running it is not offered. */
export function AssistantMinimizeButton() {
  const copy = useCopy(), { colors } = useMobileTheme();
  const busy = useAssistantVoiceBusy();
  if (!busy) return null;
  return <IconButton label={copy("Asistanı küçült", "Minimize assistant")} onPress={() => {
    minimizeAssistantCompanion();
    goBack("/");
  }}><Minimize2 size={20} color={colors.text} /></IconButton>;
}

/** One movable companion survives route changes; explicit native calls own background audio. */
export function AssistantCompanion({ children }: PropsWithChildren) {
  const copy = useCopy();
  const state = useAssistantCompanion(), machine = useActiveMachine(), pathname = usePathname();
  // The microphone level changes many times a second; only the floating orb below reads it, not this app shell.
  const call = useAssistantCall(useShallow(({ phase, reconnecting, muted, error, asleep, thread }) => ({ phase, reconnecting, muted, error, asleep, thread })));
  const bottomClearance = useBottomChromeClearance();
  const security = useSecurity(useShallow(({ status, appState, windowFocused }) => ({ status, appState, windowFocused })));
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
  // Leaving the assistant keeps a running call, reconnect, recording or read-aloud in the floating window.
  // When the assistant was only browsed, nothing is left behind to cover the next screen.
  useEffect(() => {
    // Returning to a screen that was only hidden (a pushed settings page) owns the assistant again.
    if (pathname === "/assistant") { if (state.mode === "closed" && state.machineId) useAssistantCompanion.setState({ mode: "full" }); return; }
    if (state.mode !== "full") return;
    const call = useAssistantCall.getState();
    if (call.phase !== "idle" || call.reconnecting || state.voice !== "idle") minimizeAssistantCompanion();
    // The selected conversation stays for the next visit; only the window is not shown.
    else useAssistantCompanion.setState({ mode: "closed" });
  }, [pathname, state.mode]);
  // The access gate owns this lifetime, including consent withdrawal and sign-out.
  useEffect(() => () => { cancelAssistantVoice(); endAssistantCall(); }, []);
  const minimized = matches && state.mode === "minimized" && security.status === "unlocked";
  const status = state.voice === "recording" ? copy("Dinleniyor", "Listening")
    : state.voice === "transcribing" ? copy("Yazıya çevriliyor", "Transcribing")
    : state.voice === "speaking" ? copy("Sesli yanıt", "Speaking")
    : state.voice === "preparing" ? copy("Ses hazırlanıyor", "Preparing voice") : copy("Asistan", "Assistant");
  const callActive = call.phase !== "idle" || !!call.reconnecting;
  const callOrb = call.reconnecting && call.phase === "idle" ? "thinking" : assistantOrbState(call.phase, call.muted, call.error);
  const callStatus = call.error ? copy("Görüşme durdu", "Call stopped")
    : call.reconnecting ? copy("Yeniden bağlanıyor…", "Reconnecting…")
    : call.asleep && call.phase === "idle" ? copy("Sessizlik nedeniyle duraklatıldı", "Paused after silence")
    : callOrb === "listening" ? copy("Dinleniyor", "Listening")
    : call.phase === "sending" ? copy("Yanıt bekleniyor", "Waiting for reply")
    : call.phase === "speaking" ? copy("Sesli yanıt", "Speaking")
    : callOrb === "muted" ? copy("Bağlı · Mikrofon kapalı", "Connected · Microphone off")
    : copy("Ses hazırlanıyor", "Preparing voice");
  return <View style={{ flex: 1 }}>
    <View style={{ flex: 1 }}>{children}</View>
    {minimized ? <AssistantFloatingCallWindow title={state.name || copy("Asistan", "Assistant")}
      bottomInset={bottomClearance}
      status={callActive || call.error || call.asleep ? callStatus : status} active={callActive || state.voice !== "idle"} muted={call.muted}
      orbState={callActive || call.error ? callOrb
        : state.error ? "error" : state.voice === "recording" ? "listening" : state.voice === "speaking" ? "speaking" : state.voice === "idle" ? "idle" : "thinking"}
      onExpand={() => {
        if (callActive && call.thread) useAssistantCompanion.setState({ thread: call.thread, projectId: call.thread.projectId ?? "" });
        openAssistantCompanion(state.machineId, state.environmentId); router.navigate("/assistant");
      }}
      onClose={() => { endAssistantCall(); closeAssistantCompanion(); }}
      onMute={callActive && call.phase !== "idle" ? () => muteAssistantCall(!call.muted) : undefined}
      onPip={callActive && call.phase !== "idle" && assistantPictureInPictureSupported() ? () => { void pictureInPictureAssistant().catch(error => useAssistantCall.setState({ error })); } : undefined}
    /> : null}
  </View>;
}

/** Reads the call's microphone level only while its orb shows listening, so other states never re-render on it. */
function AssistantFloatingCallWindow(props: Omit<Parameters<typeof AssistantFloatingWindow>[0], "level">) {
  const level = useAssistantCall(state => props.orbState === "listening" ? state.level : 0);
  return <AssistantFloatingWindow {...props} level={level} />;
}
