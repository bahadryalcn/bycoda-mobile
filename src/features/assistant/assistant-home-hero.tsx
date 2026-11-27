import { View, useWindowDimensions } from "react-native";
import AudioLines from "lucide-react-native/icons/audio-lines";
import MessageSquare from "lucide-react-native/icons/message-square";
import { Body, Button, StateView } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { AssistantVoiceOrb } from "./assistant-voice-stage";

/**
 * The home orb's side: large enough to lead the page, but never wider than the screen minus its
 * gutters or taller than 40% of it, so the actions below stay in view on short and landscape screens.
 */
export function assistantHomeOrbSize(viewport: { width: number; height: number }, compact = false): number {
  if (compact) return 112;
  return Math.round(Math.max(160, Math.min(320, viewport.width - 56, viewport.height * 0.4)));
}

/** The same stage and orb introduce the assistant while its Host profile loads. */
export function AssistantHomeLoading({ label }: { label: string }) {
  const viewport = useWindowDimensions();
  const { uiStyles } = useMobileTheme();
  const size = assistantHomeOrbSize(viewport);
  return <View accessible accessibilityRole="progressbar" accessibilityLabel={label}
    accessibilityState={{ busy: true }} aria-busy
    style={{ flex: 1, minHeight: size, alignItems: "center", justifyContent: "center", gap: space.xs }}>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <AssistantVoiceOrb state="thinking" level={0} size={size} label={label} />
    </View>
    <Body muted selectable={false} style={uiStyles.caption}>{label}</Body>
  </View>;
}

/**
 * The assistant's front door before a conversation is open: the orb, centred in the free height. What
 * waits for the owner is listed below it (each section counts its own items). The name and the computer
 * pill sit in the top row, the ways to start in the bottom dock (`AssistantHomeActions`).
 */
export function AssistantHomeHero({ name, machineName, setupNeeded = false, compact = false }: {
  name: string; machineName: string;
  /** Work waits below the hero: the orb shrinks so questions and jobs are in view without scrolling. */
  compact?: boolean;
  /** The assistant is not set up or is switched off on the computer: calls and messages wait for it. */
  setupNeeded?: boolean;
}) {
  const copy = useCopy(), viewport = useWindowDimensions();
  // Close to the call's orb, so starting a call grows the same orb instead of swapping screens.
  const size = assistantHomeOrbSize(viewport, compact);
  // A blocking state, said as one: what is wrong and what to do, in the warning tone.
  const notes = setupNeeded ? <View style={{ alignSelf: "stretch" }}>
    <StateView size="compact" tone="warning" title={copy("Asistan {p0} üzerinde kapalı", "The assistant is off on {p0}", { p0: machineName })}
      description={copy("Kurulumu o bilgisayardaki bycoda’da bitir.", "Finish its setup in bycoda on that computer.")} />
  </View> : null;
  // Without waiting work the hero owns the list's free height and centres the orb in it.
  return <View style={{ flexGrow: compact ? 0 : 1, alignItems: "center", justifyContent: "center", gap: compact ? space.md : space.xl,
    paddingVertical: compact ? space.md : space.lg, width: "100%", maxWidth: 520, alignSelf: "center" }}>
    <AssistantVoiceOrb state="idle" level={0} size={size} label={name} />
    {notes}
  </View>;
}

/**
 * The home's two ways to start, docked at the bottom like a composer: the primary voice call and a
 * labelled "Write" beside it. Both keep 48 targets; large text stacks them instead of clipping labels.
 */
export function AssistantHomeActions({ voiceBusy, openBusy, voiceDisabled, openDisabled, onVoice, onOpen }: {
  voiceBusy: boolean; openBusy: boolean; voiceDisabled: boolean; openDisabled: boolean;
  onVoice(): void; onOpen(): void;
}) {
  const copy = useCopy(), { colors } = useMobileTheme(), { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3;
  return <View style={{ flexDirection: stacked ? "column" : "row", alignItems: "stretch", gap: space.sm,
    paddingHorizontal: space.screen, paddingTop: space.sm, width: "100%", maxWidth: 520 + space.screen * 2, alignSelf: "center" }}>
    <View style={stacked ? undefined : { flex: 2, minWidth: 0 }}>
      <Button label={copy("Sesli görüşme", "Voice call")} tone="primary" fullWidth busy={voiceBusy} disabled={voiceDisabled} onPress={onVoice}>
        <AudioLines size={18} color={colors.primaryText} />
      </Button>
    </View>
    <View style={stacked ? undefined : { flex: 1, minWidth: 0 }}>
      <Button label={copy("Yaz", "Write")} accessibilityLabel={copy("Yazarak konuş", "Write a message")} fullWidth
        busy={openBusy} disabled={openDisabled} onPress={onOpen}>
        <MessageSquare size={18} color={openDisabled ? colors.muted : colors.text} />
      </Button>
    </View>
  </View>;
}
