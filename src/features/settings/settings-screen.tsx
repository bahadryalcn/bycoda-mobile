import { useMobileTheme } from "@/ui/theme";
import { useState } from "react";
import { router } from "expo-router";
import Laptop from "lucide-react-native/icons/laptop";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import LockKeyhole from "lucide-react-native/icons/lock-keyhole";
import LifeBuoy from "lucide-react-native/icons/life-buoy";
import Info from "lucide-react-native/icons/info";
import Type from "lucide-react-native/icons/type";
import Moon from "lucide-react-native/icons/moon";
import Sun from "lucide-react-native/icons/sun";
import Globe from "lucide-react-native/icons/globe";
import Flag from "lucide-react-native/icons/flag";
import { IconTile } from "../../ui/icon-tile";
import { LANGUAGES } from "../../localization";
import { useActiveMachine, useMachines } from "../../state/machines";
import { useAppearance } from "../../state/appearance";
import {
  NavigationGroup,
  NavigationRow,
  Notice,
  Screen,
  Section,
  SelectField,
  Sheet,
} from "../../ui/primitives";
import { colors } from "../../ui/tokens";
import { useCopy } from "../../ui/copy";
import { SecuritySettings } from "../security/security-settings";
import { EngagementSettings } from "../engagement/engagement-settings";
import { HostSettingsEditor } from "./host-settings-editor";
import { LocalDataControls } from "./local-data-controls";
import { ChatAppearanceSettings } from "./chat-appearance-settings";
import { DevicePermissionSettings } from "../permissions/device-permission-settings";

export function SettingsScreen() {
  useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const language = useMachines((s) => s.language);
  const setLanguage = useMachines((s) => s.setLanguage);
  const themeMode = useAppearance((s) => s.themeMode);
  const setThemeMode = useAppearance((s) => s.setThemeMode);
  const appearanceHydrated = useAppearance((s) => s.hydrated);
  const appearanceError = useAppearance((s) => s.storageError);
  const [panel, setPanel] = useState<
    "security" | "host" | "privacy" | "about" | "appearance" | "permissions" | null
  >(null);
  const titles = {
    permissions: copy("Telefon izinleri", "Phone permissions"),
    security: copy("Güvenli erişim", "Secure access"),
    host: copy("Bilgisayardaki görevler", "Tasks on your computer"),
    privacy: copy("Gizlilik ve veriler", "Privacy & data"),
    about: copy("bycoda hakkında", "About bycoda"),
    appearance: copy("Sohbet görünümü", "Chat appearance"),
  };
  const tile = (Glyph: typeof Laptop, color: string) => (
    <IconTile color={color}>
      <Glyph size={18} strokeWidth={2} color={color} />
    </IconTile>
  );
  return (
    <Screen title={copy("Ayarlar", "Settings")}>
      <NavigationGroup>
        <NavigationRow
          label={machine?.name ?? copy("Bilgisayar seçilmedi", "No computer selected")}
          detail={machine?.endpoint ?? copy("Bilgisayar bağla", "Connect a computer")}
          icon={tile(Laptop, colors.accent)}
          onPress={() => router.push("/machines")}
        />
      </NavigationGroup>
      <Section title={copy("Tercihler", "Preferences")}>
        <NavigationGroup>
          <SelectField
            variant="row"
            icon={tile(themeMode === "dark" ? Moon : Sun, colors.warning)}
            label={copy("Tema", "Theme")}
            value={themeMode}
            disabled={!appearanceHydrated}
            options={[
              { value: "system" as const, label: copy("Sistem", "System") },
              { value: "light" as const, label: copy("Açık", "Light") },
              { value: "dark" as const, label: copy("Koyu", "Dark") },
            ]}
            onChange={(value) => {
              void setThemeMode(value);
            }}
          />
          <SelectField
            variant="row"
            icon={tile(Globe, colors.info)}
            label={copy("Dil", "Language")}
            value={language}
            options={[{ value: "system" as const, label: copy("Sistem", "System") }, ...LANGUAGES]}
            onChange={setLanguage}
          />
          <NavigationRow
            label={titles.appearance}
            icon={tile(Type, colors.muted)}
            onPress={() => setPanel("appearance")}
          />
        </NavigationGroup>
        {appearanceError ? (
          <Notice
            tone="warning"
            message={copy(
              "Tema tercihi okunamadı veya kaydedilemedi. Yeniden seçerek dene.",
              "The theme preference could not be read or saved. Select it again to retry.",
            )}
          />
        ) : null}
      </Section>
      <NavigationGroup>
        <NavigationRow
          label={titles.security}
          icon={tile(ShieldCheck, colors.success)}
          onPress={() => setPanel("security")}
        />
        <NavigationRow label={titles.permissions} icon={tile(ShieldCheck, colors.info)}
          onPress={() => setPanel("permissions")} />
        <NavigationRow
          label={titles.privacy}
          icon={tile(LockKeyhole, colors.accent)}
          onPress={() => setPanel("privacy")}
        />
        {machine ? (
          <NavigationRow
            label={titles.host}
            icon={tile(SlidersHorizontal, colors.warning)}
            onPress={() => setPanel("host")}
          />
        ) : null}
      </NavigationGroup>
      <NavigationGroup>
        <NavigationRow
          label={copy("Yardım ve destek", "Help & support")}
          icon={tile(LifeBuoy, colors.muted)}
          onPress={() => router.push("/legal/help")}
        />
        <NavigationRow
          label={copy("AI içeriğini bildir", "Report AI content")}
          icon={tile(Flag, colors.danger)}
          onPress={() => router.push("/report")}
        />
        <NavigationRow
          label={titles.about}
          icon={tile(Info, colors.muted)}
          onPress={() => setPanel("about")}
        />
      </NavigationGroup>
      {panel ? (
        <Sheet visible size={panel === "appearance" ? "compact" : "form"} title={titles[panel]} onClose={() => setPanel(null)}>
          {panel === "permissions" ? (
            <DevicePermissionSettings />
          ) : panel === "appearance" ? (
            <ChatAppearanceSettings />
          ) : panel === "security" ? (
            <SecuritySettings />
          ) : panel === "host" && machine ? (
            <HostSettingsEditor key={machine.id} machineId={machine.id} />
          ) : panel === "privacy" ? (
            <>
              <NavigationGroup>
                <NavigationRow
                  label={copy("Gizlilik politikası", "Privacy policy")}
                  onPress={() => {
                    setPanel(null);
                    router.push("/legal/privacy");
                  }}
                />
                <NavigationRow
                  label={copy("Kullanım koşulları ve lisans", "Terms of use & license")}
                  onPress={() => {
                    setPanel(null);
                    router.push("/legal/terms");
                  }}
                />
              </NavigationGroup>
              <LocalDataControls />
            </>
          ) : (
            <EngagementSettings />
          )}
        </Sheet>
      ) : null}
    </Screen>
  );
}
