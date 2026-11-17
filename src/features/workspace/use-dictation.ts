import { useEffect, useRef, useState } from "react";
import { useConnectionScope } from "@/state/connection-scope";
import { useHostClient } from "@/state/queries";
import { useSecurity } from "@/state/security";
import { AssistantVoice, type AssistantVoiceState, type VoicePort } from "../assistant/assistant-voice";
import { useAssistantCall } from "../assistant/assistant-call-state";
import { useAssistantCompanion } from "../assistant/assistant-companion-state";
import { useVoicePreferences } from "../voice-settings/voice-preferences";
import { dictationBlock, dictationView } from "./dictation-model";
import { systemPromptCovering } from "@/state/system-prompt";

/**
 * Capture continues only while unlocked and in front. The iOS microphone permission dialog makes
 * the app "inactive" and unfocused for a moment; that prompt is ours, so it must not stop dictation.
 */
function captureAllowed(state: { status: string; appState: string; windowFocused: boolean }) {
  if (state.status !== "unlocked") return false;
  if (state.appState === "active" && state.windowFocused) return true;
  return state.appState === "inactive" && systemPromptCovering();
}

/**
 * Tap-to-dictate for a composer: records through the shared assistant capture, transcribes on the
 * Host and hands the text to `onText`. Recognition never sends; the owner decides what happens with it.
 */
export function useDictation({ machineId, sessionId, onText, locked }: {
  machineId: string; sessionId: string;
  /** Receives recognized text; throwing shows the message as the dictation error. */
  onText(text: string): void;
  /** True while a send or upload owns the draft. */
  locked: boolean;
}) {
  const client = useHostClient();
  const connection = useConnectionScope();
  const engineName = useVoicePreferences().preferences.engine;
  const [phase, setPhase] = useState<AssistantVoiceState>("idle");
  const [error, setError] = useState<unknown>(null);
  const engine = useRef<AssistantVoice | null>(null);
  const loading = useRef<Promise<AssistantVoice> | null>(null);
  const alive = useRef(true);
  const latest = useRef({ onText }); latest.current = { onText };
  const security = useSecurity();
  const callActive = useAssistantCall(state => state.phase !== "idle");
  const assistantVoice = useAssistantCompanion(state => state.voice !== "idle");
  const sameMachine = !!client && client.machine.id === machineId;
  const block = dictationBlock({ connected: sameMachine, capabilities: client?.machine.capabilities, engine: engineName, otherVoiceActive: callActive || assistantVoice });
  const view = dictationView(phase, block, locked);

  // Releases the native microphone when the composer leaves the screen.
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; engine.current?.cancel(); };
  }, []);
  // Lock, background and a changed computer connection must stop capture; the owner sees why.
  useEffect(() => {
    if (phase === "idle") return;
    if (!captureAllowed(security)) {
      engine.current?.cancel();
      setError(new Error("Dictation stopped because the app lost focus. Return to bycoda and try again."));
    }
  }, [phase, security.status, security.appState, security.windowFocused]);

  const load = () => {
    loading.current ??= import("../assistant/assistant-voice-native").then(({ nativeVoiceDependencies }) => {
      engine.current = new AssistantVoice(nativeVoiceDependencies({
        state: next => { if (alive.current) setPhase(next); },
        transcript: (_target, text) => {
          try { latest.current.onText(text); } catch (cause) { if (alive.current) setError(cause); }
        },
        error: cause => { if (alive.current) setError(cause); },
      }));
      return engine.current;
    }).catch(cause => { loading.current = null; throw cause; });
    return loading.current;
  };
  const toggle = async () => {
    if (phase === "recording") { await engine.current?.finish(); return; }
    if (view.disabled || !client || !connection.review) return;
    setError(null);
    const port: VoicePort = {
      current: () => alive.current && connection.isCurrent() && captureAllowed(useSecurity.getState()),
      request: (method, params, options) => client.request(method, params, options),
    };
    try {
      const voice = await load();
      await voice.record(port, { machineId, environmentId: connection.review.environmentId, threadId: sessionId });
    } catch (cause) { if (alive.current) setError(cause); }
  };
  return { view, error, phase, toggle: () => { toggle().catch(cause => { if (alive.current) setError(cause); }); }, clearError: () => setError(null) };
}
