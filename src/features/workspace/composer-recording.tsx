import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Linking, Text, View, type LayoutChangeEvent } from "react-native";
import Check from "lucide-react-native/icons/check";
import X from "lucide-react-native/icons/x";
import { ChatCircleAction } from "@/ui/chat-controls";
import { useCopy } from "@/ui/copy";
import { StatusLine, TextAction } from "@/ui/feedback";
import { useMobileTheme } from "@/ui/theme";
import { fontSize, lineHeight, radii, space } from "@/ui/tokens";
import { useReducedMotionPreference } from "@/ui/use-reduced-motion";
import { isMicrophoneDenied } from "../voice-settings/microphone-permission-notice";
import { useVoicePreferences } from "../voice-settings/voice-preferences";
import { DictationLevelMeter, dictationErrorMessage } from "./composer-dictation";
import { dictationClock, dictationLimitMs, dictationRemaining, pushWaveform, WAVEFORM_BARS, type LevelSignal, type LiveText } from "./dictation-level";
import type { useDictation } from "./use-dictation";

type Dictation = ReturnType<typeof useDictation>;

/**
 * A dictation failure as one compact, dismissible line above the session composer's capsule. A
 * permanent microphone denial adds the system Settings action to that line.
 */
export function ComposerDictationNotice({ dictation }: { dictation: Dictation }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const { error } = dictation;
  if (!error) return null;
  const dismiss = { label: copy("Kapat", "Dismiss"), onPress: dictation.clearError };
  // A permanent denial is still one compact line: it offers the system Settings page and, like every
  // other failure here, can be dismissed, so it never stays parked above the draft.
  if (isMicrophoneDenied(error)) return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <StatusLine tone="warning" label={copy("Mikrofon izni kapalı. Ayarlardan bycoda'ya mikrofon izni ver.", "Microphone access is off. Allow it for bycoda in Settings.")}
          action={{ label: copy("Ayarları aç", "Open Settings"), onPress: () => { Linking.openSettings().catch(() => {}); } }} />
      </View>
      <TextAction label={dismiss.label} color={colors.accent} onPress={dismiss.onPress} />
    </View>
  );
  return <StatusLine tone="danger" label={dictationErrorMessage(error, copy)} action={dismiss} />;
}

/**
 * The capsule's action row while dictating, in place of the toolbar:
 * `[Discard] [live waveform · m:ss] [extra] [Finish]`. Preparing and transcribing show a short label
 * and a spinner on Finish. Discard drops the recording without asking. The remaining time appears
 * only in the last five seconds before the recorder stops on its own. `extra` is the composer's
 * Stop while the agent runs with an empty draft, so the screen still has exactly one Stop.
 */
export function ComposerRecordingRow({ dictation, extra }: { dictation: Dictation; extra?: ReactNode }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const { phase } = dictation;
  const recording = phase === "recording";
  const label = phase === "preparing" ? copy("Mikrofon hazırlanıyor", "Preparing microphone")
    : phase === "transcribing" ? copy("Yazıya çevriliyor", "Transcribing") : null;
  return <>
    <ChatCircleAction label={copy("Kaydı sil", "Discard recording")} onPress={dictation.cancel}>
      <X size={19} strokeWidth={2.2} color={colors.text} />
    </ChatCircleAction>
    <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space.sm }}>
      {recording ? <RecordingStatus level={dictation.level} partial={dictation.partial} /> : (
        // Announced once per phase; the row itself fades in with the capsule's action row.
        <Text key={phase} accessibilityLiveRegion="polite" numberOfLines={1}
          style={{ flex: 1, minWidth: 0, fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.muted }}>{label}</Text>
      )}
    </View>
    {extra}
    <ChatCircleAction label={copy("Kaydı bitir", "Finish recording")} active busy={!recording} onPress={dictation.finish}>
      <Check size={18} strokeWidth={2.6} color={colors.primaryText} />
    </ChatCircleAction>
  </>;
}

/** Live level, heard words (phone recognizer) and the clock. Mounted only while recording. */
function RecordingStatus({ level, partial }: { level: LevelSignal; partial: LiveText }) {
  const copy = useCopy(), { colors } = useMobileTheme();
  const reducedMotion = useReducedMotionPreference();
  const phone = useVoicePreferences().preferences.phoneDictation;
  const heard = useSyncExternalStore(partial.subscribe, partial.get, partial.get).trim();
  return <>
    {/* Announced once when recording starts, not on every tick of the clock or the meter. */}
    <View accessible accessibilityLabel={copy("Dinleniyor", "Listening")} accessibilityLiveRegion="polite"
      style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space.sm }}>
      {heard || reducedMotion
        ? <DictationLevelMeter level={level} color={colors.text} />
        : <DictationWaveform level={level} color={colors.text} />}
      {heard ? (
        // The latest words matter most while speaking, so a long preview keeps its end.
        <Text numberOfLines={1} ellipsizeMode="head" importantForAccessibility="no"
          style={{ flex: 1, minWidth: 0, fontSize: fontSize.small, lineHeight: lineHeight.small, color: colors.muted }}>{heard}</Text>
      ) : null}
    </View>
    <RecordingClock limitMs={dictationLimitMs(phone)} />
  </>;
}

/** Elapsed time; in the last five seconds, the seconds left before the recorder stops on its own. */
function RecordingClock({ limitMs }: { limitMs: number }) {
  const copy = useCopy(), { colors } = useMobileTheme();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    // Whole seconds only, so one render per second (of this clock alone) is enough.
    const timer = setInterval(() => setElapsed(Math.min(limitMs, Date.now() - started)), 1000);
    return () => clearInterval(timer);
  }, [limitMs]);
  const left = dictationRemaining(elapsed, limitMs);
  return <Text importantForAccessibility="no" accessibilityElementsHidden
    style={{ fontSize: fontSize.small, lineHeight: lineHeight.small, color: left === null ? colors.muted : colors.warning, fontVariant: ["tabular-nums"] }}>
    {left === null ? dictationClock(elapsed) : copy("{p0} sn kaldı", "{p0}s left", { p0: left })}
  </Text>;
}

/**
 * A scrolling waveform of the microphone level, sampled ten times a second. It keeps its own
 * history, so only this view re-renders; the composer that owns the recorder does not.
 */
function DictationWaveform({ level, color }: { level: LevelSignal; color: string }) {
  const [history, setHistory] = useState<number[]>(() => pushWaveform([], 0));
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setHistory((current) => pushWaveform(current, level.get())), 100);
    return () => clearInterval(timer);
  }, [level]);
  const bar = 2.5, gap = 2.5, height = 20;
  // As many bars as the measured width holds, newest at the trailing end.
  const count = Math.max(1, Math.min(WAVEFORM_BARS, Math.floor((width + gap) / (bar + gap))));
  return <View accessible={false} importantForAccessibility="no-hide-descendants"
    onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
    style={{ flex: 1, minWidth: 0, height, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap }}>
    {history.slice(-count).map((value, index) => (
      <View key={index} style={{ width: bar, height: Math.max(3, Math.round(height * (0.12 + 0.88 * value))),
        borderRadius: radii.pill, backgroundColor: color, opacity: 0.35 + 0.65 * value }} />
    ))}
  </View>;
}
