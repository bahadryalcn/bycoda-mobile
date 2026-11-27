import { useEffect, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import Mic from "lucide-react-native/icons/mic";
import Square from "lucide-react-native/icons/square";
import { ChatCircleAction } from "@/ui/chat-controls";
import { useCopy } from "@/ui/copy";
import { StatusLine } from "@/ui/feedback";
import { showToast } from "@/ui/toast";
import { useMobileTheme } from "@/ui/theme";
import { radii, space } from "@/ui/tokens";
import { isMicrophoneDenied, MicrophonePermissionNotice } from "../voice-settings/microphone-permission-notice";
import { assistantVoiceErrorMessage } from "../assistant/assistant-voice-error";
import type { AssistantVoiceState } from "../assistant/assistant-voice";
import { useVoicePreferences } from "../voice-settings/voice-preferences";
import { dictationBars, dictationClock, dictationLimitMs, type LevelSignal, type LiveText } from "./dictation-level";
import { DictationInterrupted, dictationExplainsBlock, type DictationView } from "./dictation-model";
import type { useDictation } from "./use-dictation";

type Dictation = ReturnType<typeof useDictation>;
type Copy = ReturnType<typeof useCopy>;

/** The owner-facing sentence for a dictation failure, including the app's own interruptions. */
export function dictationErrorMessage(error: unknown, copy: Copy): string {
  if (error instanceof DictationInterrupted) return error.reason === "locked"
    ? copy("bycoda kilitlendiği için sesle yazma durdu. Kilidi açıp yeniden dene.", "Dictation stopped because bycoda locked. Unlock and try again.")
    : copy("bycoda arka plana geçtiği için sesle yazma durdu. Uygulamaya dönüp yeniden dene.", "Dictation stopped because bycoda went to the background. Return to bycoda and try again.");
  return assistantVoiceErrorMessage(error, copy);
}

/**
 * The one dictation toggle of every composer (sessions and the assistant): a microphone that becomes a
 * filled Stop square while recording. Stop is always this button, so a recording has one clear way out.
 */
export function DictationToggle({ view, label, onPress }: { view: DictationView; label: string; onPress(): void }) {
  const { colors } = useMobileTheme();
  // A blocked microphone stays dimmed but answers a tap with its reason, which was only an accessibility label.
  const blocked = dictationExplainsBlock(view);
  return <ChatCircleAction label={label} active={view.active} disabled={view.disabled && !blocked} busy={view.busy}
    onPress={blocked ? () => showToast({ tone: "info", message: label }) : onPress}>
    {view.active ? <Square size={13} strokeWidth={0} fill={colors.primaryText} color={colors.primaryText} />
      : <Mic size={19} strokeWidth={2.2} color={view.disabled && !view.busy ? colors.tertiary : colors.text} />}
  </ChatCircleAction>;
}

/** Mic toggle for the composer toolbar; a blocked state stays visible with its reason as the label. */
export function ComposerDictationButton({ dictation }: { dictation: Dictation }) {
  const copy = useCopy();
  const { view } = dictation;
  const labels = {
    start: copy("Sesle yaz", "Dictate message"),
    stop: copy("Kaydı bitir", "Finish recording"),
    preparing: copy("Mikrofon hazırlanıyor", "Preparing microphone"),
    transcribing: copy("Yazıya çevriliyor", "Transcribing"),
    "no-computer": copy("Sesle yazmak için bir bilgisayar bağla", "Connect a computer to dictate"),
    update: copy("Sesle yazmak için bilgisayarındaki bycoda'yı güncelle", "Update bycoda on your computer to dictate"),
    busy: copy("Sesli görüşme veya kayıt sürüyor", "A voice call or recording is in progress"),
  } as const;
  return <DictationToggle view={view} label={labels[view.action]} onPress={dictation.toggle} />;
}

/** Five short bars that follow the microphone; only this meter re-renders with the level. */
export function DictationLevelMeter({ level, color }: { level: LevelSignal; color: string }) {
  const value = useSyncExternalStore(level.subscribe, level.get, level.get);
  return <View accessible={false} importantForAccessibility="no-hide-descendants"
    style={{ flexDirection: "row", alignItems: "center", gap: 2, height: 16, width: 22 }}>
    {dictationBars(value).map((height, index) => (
      <View key={index} style={{ width: 2.5, height: Math.round(16 * height), borderRadius: radii.pill, backgroundColor: color }} />
    ))}
  </View>;
}

/**
 * What the phone's recognizer has heard so far, muted under the status line until the final text is
 * inserted into the draft. It never touches the field, so typed text stays as it is; the recognizer
 * clears it just before the final text arrives, so the words never show twice. Only this text
 * re-renders with partial results, and it is not a live region: the final text is what counts.
 */
function DictationPartialPreview({ partial }: { partial: LiveText }) {
  const { colors, uiStyles } = useMobileTheme();
  const text = useSyncExternalStore(partial.subscribe, partial.get, partial.get).trim();
  if (!text) return null;
  // The latest words matter most while speaking, so a long preview keeps its end.
  return <Text numberOfLines={3} ellipsizeMode="head"
    style={[uiStyles.statusLineText, { color: colors.muted, fontWeight: "400" }]}>{text}</Text>;
}

/**
 * The recording line: live microphone level, "Listening", and the elapsed time against the limit
 * the recorder stops at. Mounted only while recording, so its clock starts with the recording.
 */
function DictationRecordingLine({ level, limitMs }: { level?: LevelSignal; limitMs: number }) {
  const copy = useCopy(), { colors, semanticColors, uiStyles } = useMobileTheme();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    // The clock shows whole seconds, so one render per second is enough (also for the last-5-seconds warning).
    const timer = setInterval(() => setElapsed(Math.min(limitMs, Date.now() - started)), 1000);
    return () => clearInterval(timer);
  }, [limitMs]);
  const ink = semanticColors.info.text;
  const seconds = Math.round(limitMs / 1000);
  const ending = limitMs - elapsed <= 5000;
  return <View style={[uiStyles.statusLine, { gap: space.sm }]}>
    {level ? <DictationLevelMeter level={level} color={ink} /> : null}
    {/* Announced once when recording starts, not on every tick of the clock or the meter. */}
    <Text accessibilityLiveRegion="polite" style={[uiStyles.statusLineText, { color: ink, flex: 1 }]}>
      {copy("Dinleniyor", "Listening")}
    </Text>
    <Text accessibilityLabel={copy("En fazla {p0} saniye", "Up to {p0} seconds", { p0: seconds })}
      style={[uiStyles.statusLineText, { color: ending ? colors.warning : colors.muted, fontVariant: ["tabular-nums"] }]}>
      {`${dictationClock(elapsed)} / ${dictationClock(limitMs)}`}
    </Text>
  </View>;
}

/**
 * Dictation feedback beside a composer (below it in sessions) as one line, never a stacked box: recording (level, words and
 * time against the limit), transcribing, or the failure with Dismiss. A permanent microphone denial
 * keeps its notice, which offers the system Settings page. Sessions and the assistant share it.
 */
export function DictationFeedback({ phase, error, level, partial, limitMs, onDismiss }: {
  phase: AssistantVoiceState; error: unknown; level?: LevelSignal;
  /** Text heard so far by the phone's recognizer, previewed while recording and transcribing. */
  partial?: LiveText;
  /** Defaults to the limit of the recognizer chosen in Settings → Voice (this phone or the computer). */
  limitMs?: number; onDismiss(): void;
}) {
  const copy = useCopy();
  const phone = useVoicePreferences().preferences.phoneDictation;
  if (isMicrophoneDenied(error)) return <MicrophonePermissionNotice />;
  if (error) return <StatusLine tone="danger" label={dictationErrorMessage(error, copy)}
    action={{ label: copy("Kapat", "Dismiss"), onPress: onDismiss }} />;
  const preview = partial ? <DictationPartialPreview partial={partial} /> : null;
  if (phase === "recording") return <View style={{ gap: space.xxs }}>
    <DictationRecordingLine level={level} limitMs={limitMs ?? dictationLimitMs(phone)} />
    {preview}
  </View>;
  if (phase === "transcribing") return <View style={{ gap: space.xxs }}>
    {/* The mic button already spins for this operation; one spinner per operation. */}
    <StatusLine label={copy("Yazıya çevriliyor", "Transcribing")} />
    {preview}
  </View>;
  return null;
}
