import { View, useWindowDimensions } from "react-native";
import AudioLines from "lucide-react-native/icons/audio-lines";
import MessageSquare from "lucide-react-native/icons/message-square";
import { Badge, Body, Button, Heading, ScopeLine } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { AssistantAvatar } from "./assistant-avatar";
import { AssistantVoiceOrb } from "./assistant-voice-stage";

/** The same stage and orb introduce the assistant while its Host profile loads. */
export function AssistantHomeLoading({ label }: { label: string }) {
  const { width, height } = useWindowDimensions();
  const { uiStyles } = useMobileTheme();
  const size = Math.min(200, width * 0.48, height * 0.38);
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
 * Which computer (and project) the assistant works in, as the shared page scope line. The global
 * scope is the default and is not repeated; a project scope adds its folder.
 */
export function AssistantContextLine({ machineName, scope, project }: { machineName: string; scope: string; project: boolean }) {
  return <ScopeLine scope={{ computer: machineName, project: project ? scope : undefined }} />;
}

/** The assistant's front door before a conversation is open: who it is, where it works, and how to start. */
export function AssistantHomeHero({ name, avatar, machineName, scope, project, voiceBusy, openBusy, voiceDisabled, openDisabled, setupNeeded = false, compact = false, waiting, onVoice, onOpen }: {
  name: string; avatar?: string; machineName: string; scope: string; project: boolean;
  /** Work waits below the hero: the orb shrinks so questions and jobs are in view without scrolling. */
  compact?: boolean;
  /** Counts of what needs the owner, said on the home itself as on the desktop Room's Today. */
  waiting?: { questions: number; jobs: number };
  /** The assistant is not set up or is switched off on the computer: calls and messages wait for it. */
  setupNeeded?: boolean;
  voiceBusy: boolean; openBusy: boolean; voiceDisabled: boolean; openDisabled: boolean;
  onVoice(): void; onOpen(): void;
}) {
  const copy = useCopy(), { colors, uiStyles } = useMobileTheme(), viewport = useWindowDimensions();
  // Close to the call's orb, so starting a call grows the same orb instead of swapping screens.
  const size = compact ? 112 : Math.max(160, Math.min(260, viewport.width * 0.6, viewport.height * 0.32));
  const counts = [
    waiting?.questions ? copy("{p0} soru", "{p0} questions", { p0: waiting.questions }) : "",
    waiting?.jobs ? copy("{p0} iş seni bekliyor", "{p0} jobs need you", { p0: waiting.jobs }) : "",
  ].filter(Boolean);
  return <View style={{ alignItems: "center", gap: compact ? space.md : space.lg, paddingVertical: compact ? space.md : space.xl, width: "100%", maxWidth: 520, alignSelf: "center" }}>
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <AssistantVoiceOrb state="idle" level={0} size={size} label={name} />
      <View pointerEvents="none" style={{ position: "absolute" }}><AssistantAvatar value={avatar} size={size * 0.42} /></View>
    </View>
    <View style={{ alignItems: "center", gap: space.sm }}>
      <Heading style={[uiStyles.title, { textAlign: "center" }]}>{name}</Heading>
      <AssistantContextLine machineName={machineName} scope={scope} project={project} />
      {counts.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.xs }}>
        {counts.map(label => <Badge key={label} label={label} tone="warning" />)}
      </View> : null}
      <Body muted style={{ textAlign: "center" }}>{setupNeeded
        ? copy("Asistan {p0} üzerinde kapalı. Bilgisayardaki bycoda’dan kurulumu bitirip açın.", "The assistant is off on {p0}. Finish its setup in bycoda on that computer.", { p0: machineName })
        : copy("Sesli görüşme başlatın ya da yazarak sorun.", "Start a voice call or write a message.")}</Body>
    </View>
    <View style={{ alignSelf: "stretch", gap: space.sm }}>
      <Button label={copy("Sesli görüşme", "Voice call")} tone="primary" fullWidth busy={voiceBusy} disabled={voiceDisabled} onPress={onVoice}>
        <AudioLines size={18} color={colors.primaryText} />
      </Button>
      <Button label={copy("Konuşmayı aç", "Open conversation")} fullWidth busy={openBusy} disabled={openDisabled} onPress={onOpen}>
        <MessageSquare size={18} color={colors.accent} />
      </Button>
    </View>
  </View>;
}
