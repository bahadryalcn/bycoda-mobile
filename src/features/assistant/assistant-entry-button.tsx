import { View } from "react-native";
import { router, type Href } from "expo-router";
import AudioLines from "lucide-react-native/icons/audio-lines";
import { IconButton } from "@/ui/buttons";
import { useCopy } from "@/ui/copy";
import { iconSize, radii } from "@/ui/tokens";
import { useMobileTheme } from "@/ui/theme";
import { useAssistantCall } from "./assistant-call-state";

/** The desktop's status dot on the assistant button: live, connecting, error or nothing while standing by. */
export type AssistantEntryStatus = "standby" | "connecting" | "live" | "error";

export function assistantEntryStatus(call: { phase: string; error?: unknown; reconnecting?: number }): AssistantEntryStatus {
  if (call.error) return "error";
  if (call.phase === "starting" || call.reconnecting) return "connecting";
  if (call.phase !== "idle") return "live";
  return "standby";
}

export const ASSISTANT_ROUTE = "/assistant" as Href;

/**
 * The voice assistant entry at the far right of each tab's title row (after the page actions).
 * Keeps live call status visible while the assistant is minimized.
 */
export function AssistantEntryButton() {
  const copy = useCopy(), { colors } = useMobileTheme();
  const status = useAssistantCall(state => assistantEntryStatus(state));
  const dot = status === "live" ? colors.success : status === "connecting" ? colors.warning : status === "error" ? colors.danger : undefined;
  const label = status === "live" ? copy("Asistan, sesli görüşme sürüyor", "Assistant, voice call in progress")
    : status === "connecting" ? copy("Asistan, bağlanıyor", "Assistant, connecting")
    : status === "error" ? copy("Asistan, görüşme durdu", "Assistant, call stopped")
    : copy("Sesli asistan", "Voice assistant");
  return (
    <View>
      <IconButton label={label} onPress={() => router.navigate(ASSISTANT_ROUTE)}>
        <AudioLines size={iconSize.action} color={colors.text} />
      </IconButton>
      {dot ? <View pointerEvents="none" style={{ position: "absolute", top: 8, end: 8, width: 10, height: 10, borderRadius: radii.pill, backgroundColor: dot, borderWidth: 2, borderColor: colors.panel }} /> : null}
    </View>
  );
}
