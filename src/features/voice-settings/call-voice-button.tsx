import { useState, type PropsWithChildren } from "react";
import { type Href } from "expo-router";
import Settings2 from "lucide-react-native/icons/settings-2";
import AudioLines from "lucide-react-native/icons/audio-lines";
import Sparkles from "lucide-react-native/icons/sparkles";
import { IconButton, NavigationGroup, NavigationRow, Sheet, SettingIcon } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { iconSize } from "@/ui/tokens";
import { settingsRoutes } from "../settings/settings-routes";
import { useVoiceSettingsSummary, VOICE_SETTINGS_ROUTE } from "./voice-settings";
import { pushOnce } from "@/ui/navigation";

/**
 * The assistant's settings sheet, opened from the gear on the assistant's home, conversation and call.
 * It holds the reply model (`children`, its own row group and Save), then links out. The conversation
 * scope is chosen in the top row, not here. Status,
 * notifications, the computer and access live on Settings → Assistant, and voice and audio on
 * Settings → Voice and microphone; each row is named as the page it opens, so nothing is edited twice.
 */
export function AssistantSettingsButton({ children }: PropsWithChildren) {
  const copy = useCopy(), { colors } = useMobileTheme();
  const [open, setOpen] = useState(false);
  const summary = useVoiceSettingsSummary();
  const label = copy("Asistan ayarları", "Assistant settings");
  return (
    <>
      <IconButton label={label} expanded={open} onPress={() => setOpen(true)}>
        <Settings2 size={iconSize.action} color={colors.text} />
      </IconButton>
      <Sheet visible={open} title={label} size="form" onClose={() => setOpen(false)}>
        {open ? <>
          {children}
          {/* The pages these settings live on, each row named as the page it opens. */}
          <NavigationGroup>
            <NavigationRow label={copy("Ses ve mikrofon", "Voice and microphone")} detail={summary}
              icon={<SettingIcon glyph={AudioLines} />}
              onPress={() => { setOpen(false); pushOnce(VOICE_SETTINGS_ROUTE as Href); }} />
            <NavigationRow label={copy("Asistan", "Assistant")} detail={copy("Bildirimler, izinler", "Notifications, permissions")} separator={false}
              icon={<SettingIcon glyph={Sparkles} />}
              onPress={() => { setOpen(false); pushOnce(settingsRoutes.assistant as Href); }} />
          </NavigationGroup>
        </> : null}
      </Sheet>
    </>
  );
}
