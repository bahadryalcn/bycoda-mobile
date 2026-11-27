import AudioLines from "lucide-react-native/icons/audio-lines";
import { Notice, IconButton } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { iconSize } from "@/ui/tokens";
import { useAssistantCall } from "./assistant-call-state";
import { assistantCallErrorMessage } from "./assistant-call-error";

/** In the conversation the composer's Send is the one filled action; the call starts from a labelled icon. */
export function AssistantCallButton({ enabled, onStart }: { enabled: boolean; onStart(): void }) {
  const copy = useCopy(), { colors } = useMobileTheme();
  const active = useAssistantCall(state => state.phase !== "idle");
  return <IconButton label={copy("Sesli görüşme", "Voice call")} disabled={active || !enabled} onPress={onStart}>
    <AudioLines size={iconSize.action} color={colors.accent} />
  </IconButton>;
}

/** The last call failure, full width under the header row so a narrow button column never squeezes it. */
export function AssistantCallErrorNotice() {
  const copy = useCopy(), error = useAssistantCall((state) => state.error);
  // One sentence is shown, never folded behind a heading.
  return error ? <Notice tone="warning" message={`${copy("Sesli görüşme kullanılamıyor", "Voice call unavailable")}. ${assistantCallErrorMessage(error, copy)}`} /> : null;
}
