import { useState, type PropsWithChildren, type ReactNode } from "react";
import { router, type Href } from "expo-router";
import Settings2 from "lucide-react-native/icons/settings-2";
import { IconButton, NavigationGroup, NavigationRow, Section, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { iconSize } from "@/ui/tokens";
import { VoiceChoices } from "./voice-choices";

/**
 * The assistant's settings sheet, opened from the gear on the assistant's home, conversation and call.
 * Groups follow the desktop: this conversation (`children`), voice (what can change during a call,
 * with a link to all voice settings) and the assistant's work and access (`details`).
 * Audio changes apply at the next safe turn boundary.
 */
export function CallVoiceButton({ children, details }: PropsWithChildren<{ details?: ReactNode }>) {
  const copy = useCopy(), { colors } = useMobileTheme();
  const [open, setOpen] = useState(false);
  const label = copy("Asistan ayarları", "Assistant settings");
  return (
    <>
      <IconButton label={label} expanded={open} onPress={() => setOpen(true)}>
        <Settings2 size={iconSize.action} color={colors.text} />
      </IconButton>
      <Sheet visible={open} title={label} size="form" onClose={() => setOpen(false)}>
        {open ? <>
          {children ? <Section title={copy("Bu konuşma", "This conversation")}>{children}</Section> : null}
          <Section title={copy("Ses", "Voice")}>
            <VoiceChoices />
            <NavigationGroup>
              <NavigationRow label={copy("Tüm ses ayarları", "All voice settings")} separator={false}
                onPress={() => { setOpen(false); router.push("/settings/voice" as Href); }} />
            </NavigationGroup>
          </Section>
          {details}
        </> : null}
      </Sheet>
    </>
  );
}
