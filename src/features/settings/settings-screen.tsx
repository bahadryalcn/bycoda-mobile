import { useMobileTheme } from "@/ui/theme";
import { useState } from "react";
import { router, type Href } from "expo-router";
import Laptop from "lucide-react-native/icons/laptop";
import Server from "lucide-react-native/icons/server";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import Smartphone from "lucide-react-native/icons/smartphone";
import LayoutDashboard from "lucide-react-native/icons/layout-dashboard";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import LockKeyhole from "lucide-react-native/icons/lock-keyhole";
import LifeBuoy from "lucide-react-native/icons/life-buoy";
import Info from "lucide-react-native/icons/info";
import Type from "lucide-react-native/icons/type";
import MessageSquare from "lucide-react-native/icons/message-square";
import Globe from "lucide-react-native/icons/globe";
import Flag from "lucide-react-native/icons/flag";
import UserRound from "lucide-react-native/icons/user-round";
import { ThemeSelector } from "panelui-native/components/theme-selector";
import { IconTile } from "../../ui/icon-tile";
import { LANGUAGES } from "../../localization";
import { useActiveMachine, useMachines } from "../../state/machines";
import { reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import { useAppearance } from "../../state/appearance";
import { useChatAppearance } from "../../state/chat-appearance";
import { busySendStore, useBusySend } from "../../state/busy-send";
import { chatTextSizeOptions } from "./chat-appearance-options";
import { chatAppearanceFeedback } from "./chat-appearance-feedback";
import {
  NavigationGroup,
  NavigationRow,
  Notice,
  Screen,
  Section,
  SelectField,
  Sheet,
  StateView,
} from "../../ui/primitives";
import { useCopy } from "../../ui/copy";
import { SecuritySettings } from "../security/security-settings";
import { EngagementSettings } from "../engagement/engagement-settings";
import { HostSettingsEditor } from "./host-settings-editor";
import { LocalDataControls } from "./local-data-controls";
import { DiagnosticsSettings } from "../diagnostics/DiagnosticsSettings";
import { ChatAppearanceSettings } from "./chat-appearance-settings";
import { PalettePicker } from "./palette-picker";
import { PALETTES } from "@/ui/tokens";
import { WidgetSettings } from "../widgets";
import { DevicePermissionSettings } from "../permissions/device-permission-settings";

export function SettingsScreen() {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const language = useMachines((s) => s.language);
  const setLanguage = useMachines((s) => s.setLanguage);
  const storageError = useMachines((s) => s.storageError);
  const storageHydrated = useMachines((s) => s.hydrated);
  const themeMode = useAppearance((s) => s.themeMode);
  const setThemeMode = useAppearance((s) => s.setThemeMode);
  const palette = useAppearance((s) => s.palette);
  const setPalette = useAppearance((s) => s.setPalette);
  const appearanceHydrated = useAppearance((s) => s.hydrated);
  const appearanceError = useAppearance((s) => s.storageError);
  const busySend = useBusySend((s) => s.mode);
  const busySendHydrated = useBusySend((s) => s.hydrated);
  const chatTextSize = useChatAppearance((s) => s.textSize);
  const chatHydrated = useChatAppearance((s) => s.hydrated);
  const chatStorageError = useChatAppearance((s) => s.storageError);
  const chatSizeLabel = chatTextSizeOptions(copy).find(
    (option) => option.value === chatTextSize,
  )?.label;
  const chatFeedback = chatAppearanceFeedback(chatStorageError, copy);
  const [panel, setPanel] = useState<
    "security" | "host" | "privacy" | "about" | "appearance" | "visual" | "permissions" | null
  >(null);
  const [hostTarget, setHostTarget] = useState<{
    id: string;
    name: string;
    target: ReviewedMachine | undefined;
  }>();
  const titles = {
    permissions: copy("Telefon izinleri", "Phone permissions"),
    security: copy("Güvenli erişim", "Secure access"),
    host: copy("Çalışma", "Work"),
    privacy: copy("Gizlilik ve veriler", "Privacy & data"),
    about: copy("bycoda hakkında", "About bycoda"),
    appearance: copy("Sohbet görünümü", "Chat appearance"),
    visual: copy("Görünüm", "Appearance"),
  };
  const tile = (Glyph: typeof Laptop) => (
    <IconTile color={colors.muted}>
      <Glyph size={18} strokeWidth={2} color={colors.muted} />
    </IconTile>
  );
  return (
    <Screen title={copy("Ayarlar", "Settings")}>
      <Section title={copy("Tercihler", "Preferences")}>
        <NavigationGroup>
          <NavigationRow
            label={titles.visual}
            detail={[
              themeMode === "system"
                ? copy("Sistem", "System")
                : themeMode === "light"
                  ? copy("Açık", "Light")
                  : copy("Koyu", "Dark"),
              ...PALETTES.filter((item) => item.id === palette).map((item) =>
                copy(item.nameTr, item.name),
              ),
            ].join(", ")}
            onPress={() => setPanel("visual")}
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
        <NavigationGroup>
          <SelectField
            variant="row"
            icon={tile(Globe)}
            label={copy("Dil", "Language")}
            value={language}
            disabled={!storageHydrated || !!storageError}
            options={[{ value: "system" as const, label: copy("Sistem", "System") }, ...LANGUAGES]}
            onChange={setLanguage}
          />
          <NavigationRow
            label={copy("Mesaj yazı boyutu", "Message text size")}
            detailLines={0}
            detail={
              chatFeedback?.summary ??
              (!chatHydrated ? copy("Yükleniyor…", "Loading…") : chatSizeLabel)
            }
            icon={tile(Type)}
            onPress={() => setPanel("appearance")}
          />
        </NavigationGroup>
        {panel === "visual" ? (
          <Sheet visible title={titles.visual} size="form" onClose={() => setPanel(null)}>
            <ThemeSelector
              label={copy("Tema", "Theme")}
              size="sm"
              value={themeMode}
              applyTheme={false}
              disabled={!appearanceHydrated}
              onValueChange={(value) => {
                void setThemeMode(value);
              }}
            >
              <ThemeSelector.Option value="system" label={copy("Sistem", "System")} />
              <ThemeSelector.Option value="light" label={copy("Açık", "Light")} />
              <ThemeSelector.Option value="dark" label={copy("Koyu", "Dark")} />
            </ThemeSelector>
            <PalettePicker
              value={palette}
              disabled={!appearanceHydrated}
              onChange={(value) => {
                void setPalette(value);
              }}
            />
            {appearanceError ? (
              <Notice
                tone="warning"
                message={copy(
                  "Tema tercihi okunamadı veya kaydedilemedi. Yeniden seçerek dene.",
                  "The theme preference could not be read or saved. Select it again to retry.",
                )}
              />
            ) : null}
          </Sheet>
        ) : null}
        {storageError ? (
          <StateView
            compact
            tone="warning"
            illustration="error"
            title={copy(
              "Kaydedilmiş bağlantılar kullanılamıyor",
              "Saved connections are unavailable",
            )}
            description={storageError}
            action={{
              label: copy("Depolamayı kurtar", "Recover saved connections"),
              onPress: () => router.push("/machines"),
            }}
          />
        ) : null}
      </Section>
      <Section title={copy("Hesap", "Account")}>
        <NavigationGroup>
          <NavigationRow
            label={copy("bycoda hesabı", "bycoda account")}
            detail={copy(
              "İsteğe bağlı giriş, cihazlar ve aktif süre",
              "Optional sign-in, devices and active time",
            )}
            icon={tile(UserRound)}
            onPress={() => router.push("/account" as Href)}
          />
        </NavigationGroup>
      </Section>
      <Section title={copy("Bilgisayar", "Computer")}>
        <NavigationGroup>
          <NavigationRow
            label={copy("Bilgisayarlar", "Computers")}
            detailLines={0}
            detail={machine?.name ?? copy("Bilgisayar bağla", "Connect a computer")}
            icon={tile(Laptop)}
            onPress={() => router.push("/machines")}
          />
          {machine ? (
            <>
              <NavigationRow
                label={copy("Bilgisayar erişimi", "Host access")}
                icon={tile(ShieldCheck)}
                onPress={() =>
                  router.push({
                    pathname: "/tools/[tool]",
                    params: { tool: "access", machineId: machine.id },
                  })
                }
              />
              <NavigationRow
                label={copy("Sağlayıcı merkezi", "Provider center")}
                icon={tile(Server)}
                onPress={() =>
                  router.push({
                    pathname: "/tools/[tool]",
                    params: { tool: "providers", machineId: machine.id },
                  })
                }
              />
              <NavigationRow
                label={titles.host}
                icon={tile(SlidersHorizontal)}
                onPress={() => {
                  setHostTarget({
                    id: machine.id,
                    name: machine.name,
                    target: reviewedMachine(machine),
                  });
                  setPanel("host");
                }}
              />
            </>
          ) : null}
        </NavigationGroup>
      </Section>
      <Section title={copy("Erişim ve gizlilik", "Access & privacy")}>
        <NavigationGroup>
          <NavigationRow
            label={titles.security}
            icon={tile(ShieldCheck)}
            onPress={() => setPanel("security")}
          />
          <NavigationRow
            label={titles.permissions}
            icon={tile(Smartphone)}
            onPress={() => setPanel("permissions")}
          />
          <WidgetSettings icon={tile(LayoutDashboard)} />
          <NavigationRow
            label={titles.privacy}
            icon={tile(LockKeyhole)}
            onPress={() => setPanel("privacy")}
          />
        </NavigationGroup>
      </Section>
      <Section title={copy("Destek", "Support")}>
        <NavigationGroup>
          <NavigationRow
            label={copy("Yardım ve destek", "Help & support")}
            icon={tile(LifeBuoy)}
            onPress={() => router.push("/legal/help")}
          />
          <NavigationRow
            label={copy("AI içeriğini bildir", "Report AI content")}
            icon={tile(Flag)}
            onPress={() => router.push("/report")}
          />
          <NavigationRow label={titles.about} icon={tile(Info)} onPress={() => setPanel("about")} />
        </NavigationGroup>
      </Section>
      {panel && panel !== "visual" ? (
        <Sheet
          visible
          size={
            panel === "appearance" ||
            panel === "privacy" ||
            panel === "about" ||
            panel === "host" ||
            (process.env.EXPO_OS === "web" && (panel === "security" || panel === "permissions"))
              ? "compact"
              : "form"
          }
          title={titles[panel]}
          onClose={() => setPanel(null)}
        >
          {panel === "permissions" ? (
            <DevicePermissionSettings />
          ) : panel === "appearance" ? (
            <ChatAppearanceSettings />
          ) : panel === "security" ? (
            <SecuritySettings />
          ) : panel === "host" && hostTarget ? (
            <HostSettingsEditor
              key={hostTarget.id}
              machineId={hostTarget.id}
              machineName={hostTarget.name}
              target={hostTarget.target}
            />
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
              <DiagnosticsSettings />
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
