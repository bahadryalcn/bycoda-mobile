import { useState, type PropsWithChildren, type ReactNode } from "react";
import Settings2 from "lucide-react-native/icons/settings-2";
import { Disclosure, IconButton, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { VoiceChoices } from "./voice-choices";

/**
 * Opens the call's voice settings in place: who understands the owner and how the assistant sounds.
 * Audio changes apply at the next safe turn boundary.
 */
export function CallVoiceButton({ children, details }: PropsWithChildren<{ details?: ReactNode }>) {
  const copy = useCopy(), { colors } = useMobileTheme();
  const [open, setOpen] = useState(false);
  const label = copy("Ayarlar", "Settings");
  return (
    <>
      <IconButton label={label} expanded={open} onPress={() => setOpen(true)}>
        <Settings2 size={22} color={colors.text} />
      </IconButton>
      <Sheet visible={open} title={label} size="form" onClose={() => setOpen(false)}>
        {open ? <>
          {children}
          {children ? (
            <Disclosure label={copy("Ses ayarları", "Voice settings")}><VoiceChoices /></Disclosure>
          ) : <VoiceChoices />}
          {details}
        </> : null}
      </Sheet>
    </>
  );
}
