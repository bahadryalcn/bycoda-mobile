import { useEffect, useRef, useState } from "react";
import { useConnectionScope } from "@/state/connection-scope";
import { useHostClient } from "@/state/queries";
import { useSecurity } from "@/state/security";
import { useShallow } from "zustand/react/shallow";
import type { AssistantVoiceState, VoicePort } from "../assistant/assistant-voice";
import { useAssistantCall } from "../assistant/assistant-call-state";
import { useAssistantCompanion } from "../assistant/assistant-companion-state";
import { useVoicePreferences, voicePreferences } from "../voice-settings/voice-preferences";
import { captureAllowed as captureAllowedBy, dictationBlock, dictationEndedByInterruption, dictationInterruption, dictationView, recognizedDictation } from "./dictation-model";
import { computerLanguage, dictationEngineKind, loadDictationRecorder, type DictationEngineKind, type DictationRecorder } from "./dictation-engine";
import { DICTATION_CLEANUP_CAPABILITY, DictationProcessor, type DictationProcessContext } from "./dictation-processing";
import { createLevelSignal, createTextSignal } from "./dictation-level";
import { systemPromptCovering } from "@/state/system-prompt";

/** Window focus is deliberately ignored while the app is active (see `captureAllowed`). */
const captureAllowed = (state: { status: string; appState: string }) => captureAllowedBy(state, systemPromptCovering);

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
  const preferences = useVoicePreferences().preferences;
  const engineName = preferences.engine;
  // Settings → Voice assistant → Transcription decides whether this phone or the computer recognizes dictation.
  const kind = dictationEngineKind(preferences);
  const [phase, setPhase] = useState<AssistantVoiceState>("idle");
  // The recorder's last reported phase, read synchronously when it reports the next one.
  const reported = useRef<AssistantVoiceState>("idle");
  const [error, setError] = useState<unknown>(null);
  /**
   * Text the phone recognizer has heard so far; empty for computer dictation, which returns text at the end.
   * Only the preview reads it, so the composer owning this hook does not re-render with every partial.
   */
  const partial = useRef(createTextSignal()).current;
  const engine = useRef<DictationRecorder | null>(null);
  const loading = useRef<{ kind: DictationEngineKind; recorder: Promise<DictationRecorder> } | null>(null);
  const alive = useRef(true);
  // The meter reads the level; the composer owning this hook does not re-render with it.
  const level = useRef(createLevelSignal()).current;
  const latest = useRef({ onText }); latest.current = { onText };
  // Custom words, filler removal and the optional cleanup on the computer, with the desktop's settings.
  const processor = useRef<DictationProcessor | null>(null);
  processor.current ??= new DictationProcessor({
    preferences: () => voicePreferences.getState().preferences,
    createId: async () => (await import("expo-crypto")).randomUUID(),
    spokenLanguage: async () => (await computerLanguage())(),
  });
  /** The computer the current recording goes to, captured when it starts. */
  const processing = useRef<DictationProcessContext | null>(null);
  // Only the fields that stop a recording: the whole security store also changes on unrelated updates.
  // Window focus is not read: Android drops it for the shade and system dialogs while the app stays active.
  const security = useSecurity(useShallow(({ status, appState }) => ({ status, appState })));
  // Bumped by Discard, so a recording still loading its recorder never starts afterwards.
  const attempt = useRef(0);
  const callActive = useAssistantCall(state => state.phase !== "idle");
  const assistantVoice = useAssistantCompanion(state => state.voice !== "idle");
  const sameMachine = !!client && client.machine.id === machineId;
  const block = dictationBlock({ connected: sameMachine, capabilities: client?.machine.capabilities, engine: engineName, phone: kind === "phone", otherVoiceActive: callActive || assistantVoice });
  const view = dictationView(phase, block, locked);

  // Releases the native microphone when the composer leaves the screen.
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; engine.current?.cancel(); processor.current?.cancel(); };
  }, []);
  // Lock, background and a changed computer connection must stop capture; the owner sees why.
  useEffect(() => {
    if (phase === "idle") return;
    if (!captureAllowed(security)) {
      attempt.current++;
      engine.current?.cancel();
      processor.current?.cancel();
      setError(dictationInterruption(security));
    }
  }, [phase, security]);

  const load = () => {
    if (loading.current?.kind === kind) return loading.current.recorder;
    engine.current?.cancel(); engine.current = null;
    const recorder = loadDictationRecorder(kind, {
      state: next => {
        const previous = reported.current;
        reported.current = next;
        if (!alive.current) return;
        setPhase(next);
        // Background or lock seen by the recorder first: still say why the recording stopped.
        const stopped = dictationEndedByInterruption(previous, next, useSecurity.getState(), systemPromptCovering);
        if (stopped) setError(stopped);
      },
      transcript: async (_target, text) => {
        // The recording stays "transcribing" while custom words and the optional cleanup run.
        const context = processing.current;
        const processed = context && processor.current ? await processor.current.process(context, text) : text;
        // Discarded meanwhile: nothing reaches the draft.
        if (processed === null || !alive.current) return;
        try { latest.current.onText(recognizedDictation(processed)); } catch (cause) { if (alive.current) setError(cause); }
      },
      error: cause => { if (alive.current) setError(cause); },
      level: value => level.set(value),
      partial: text => partial.set(text),
    }).then(created => { engine.current = created; return created; })
      .catch(cause => { if (loading.current?.recorder === recorder) loading.current = null; throw cause; });
    loading.current = { kind, recorder };
    return recorder;
  };
  const toggle = async () => {
    if (phase === "recording") { await engine.current?.finish(); return; }
    if (view.disabled || !client || !connection.review) return;
    setError(null);
    const current = ++attempt.current;
    const port: VoicePort = {
      current: () => alive.current && connection.isCurrent() && captureAllowed(useSecurity.getState()),
      request: (method, params, options) => client.request(method, params, options),
    };
    try {
      const voice = await load();
      if (current !== attempt.current || !alive.current) return;
      processing.current = { port, cleanupAvailable: client.machine.capabilities?.includes(DICTATION_CLEANUP_CAPABILITY) === true };
      await voice.record(port, { machineId, environmentId: connection.review.environmentId, threadId: sessionId });
    } catch (cause) { if (alive.current) setError(cause); }
  };
  /** Keeps the recording: stops listening and hands the recognized text to `onText`. */
  const finish = () => { void Promise.resolve(engine.current?.finish()).catch(cause => { if (alive.current) setError(cause); }); };
  /** Discards the recording (or a transcription still running) without asking; nothing reaches the draft. */
  const cancel = () => {
    attempt.current++;
    engine.current?.cancel();
    processor.current?.cancel();
    partial.set(""); level.set(0);
    setPhase("idle");
  };
  return {
    view, error, phase, level, partial, finish, cancel,
    toggle: () => { toggle().catch(cause => { if (alive.current) setError(cause); }); },
    clearError: () => setError(null),
  };
}
