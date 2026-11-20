import { useState } from "react";
import { View } from "react-native";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import { Body, PressableCard, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { radii, space } from "@/ui/tokens";
import { VoiceChoices } from "./voice-choices";

/**
 * Opens the call's voice settings in place: who understands the owner and how the assistant sounds.
 * Recognition changes apply to the next turn; the voice applies from the next call.
 */
export function CallVoiceButton({ inCall }: { inCall: boolean }) {
  const copy = useCopy(), { colors, uiStyles } = useMobileTheme();
  const [open, setOpen] = useState(false);
  const label = copy("Ses ayarları", "Voice settings");
  return (
    <>
      {/* A pill like the call status: a Button sized to its label clipped its text on Samsung. */}
      <PressableCard label={label} expanded={open} onPress={() => setOpen(true)}
        style={{ alignSelf: "center", maxWidth: "100%", minHeight: 40, marginHorizontal: 0, paddingVertical: space.xs, paddingHorizontal: space.md, borderRadius: radii.pill, backgroundColor: colors.glass }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <SlidersHorizontal size={16} color={colors.muted} />
          <Body selectable={false} numberOfLines={1} muted style={[uiStyles.caption, { flexShrink: 1 }]}>{label}</Body>
        </View>
      </PressableCard>
      <Sheet visible={open} title={label} size="form" onClose={() => setOpen(false)}>
        {open ? <VoiceChoices inCall={inCall} /> : null}
      </Sheet>
    </>
  );
}
