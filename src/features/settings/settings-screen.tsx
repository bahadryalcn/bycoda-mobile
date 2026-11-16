import { useMobileTheme } from "@/ui/theme";
import { useState } from "react";
import { router, type Href } from "expo-router";
import Laptop from "lucide-react-native/icons/laptop";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import Smartphone from "lucide-react-native/icons/smartphone";
import LayoutDashboard from "lucide-react-native/icons/layout-dashboard";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import LockKeyhole from "lucide-react-native/icons/lock-keyhole";
import LifeBuoy from "lucide-react-native/icons/life-buoy";
import Info from "lucide-react-native/icons/info";
import Palette from "lucide-react-native/icons/palette";
import MessageSquare from "lucide-react-native/icons/message-square";
import Globe from "lucide-react-native/icons/globe";
import Flag from "lucide-react-native/icons/flag";
import UserRound from "lucide-react-native/icons/user-round";
import { IconTile } from "../../ui/icon-tile";
import { LANGUAGES } from "../../localization";
import { useActiveMachine, useMachines } from "../../state/machines";
import { reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import { useAppearance } from "../../state/appearance";
import { busySendStore, useBusySend } from "../../state/busy-send";
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
import { AppearanceSettings } from "./appearance-settings";
import { appearanceSummary, themeModeOptions } from "./appearance-settings-model";
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
  const palette = useAppearance((s) => s.palette);
  const textScale = useAppearance((s) => s.typography.scale);
  const appearanceError = useAppearance((s) => s.storageError);
  const busySend = useBusySend((s) => s.mode);
  const busySendHydrated = useBusySend((s) => s.hydrated);
  const busySendError = useBusySend((s) => s.storageError);
  const [panel, setPanel] = useState<
    "security" | "host" | "privacy" | "about" | "visual" | "permissions" | null
  >(null);
  const [hostTarget, setHostTarget] = useState<{
    id: string;
    name: string;
    target: ReviewedMachine | undefined;
  }>();
  const titles = {
    permissions: copy("Telefon izinleri", "Phone permissions"),
    security: copy("Güvenli erişim", "Secure access"),
    host: copy("Bilgisayar ayarları", "Computer settings"),
    privacy: copy("Gizlilik ve veriler", "Privacy & data"),
    about: copy("bycoda hakkında", "About bycoda"),
    visual: copy("Görünüm", "Appearance"),
  };
  const tile = (Glyph: typeof Laptop) => (
    <IconTile color={colors.muted}>
      <Glyph size={18} strokeWidth={2} color={colors.muted} />
    </IconTile>
  );
  return (
    <Screen title={copy("Ayarlar", "Settings")}>
      <Section title={copy("Hesap", "Account")}>
        <NavigationGroup>
          <NavigationRow
            label={copy("bycoda hesabı", "bycoda account")}
            detail={copy(
              "Hesap, cihazlar ve aktif süre",
              "Account, devices and active time",
            )}
            icon={tile(UserRound)}
            onPress={() => router.navigate("/account" as Href)}
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
            onPress={() => router.navigate("/machines")}
          />
          {machine ? (
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
          ) : null}
        </NavigationGroup>
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
              onPress: () => router.navigate("/machines"),
            }}
          />
        ) : null}
      </Section>
      <Section title={copy("Tercihler", "Preferences")}>
        <NavigationGroup>
          <NavigationRow
            label={titles.visual}
            icon={tile(Palette)}
            detailLines={0}
            detail={appearanceSummary({
              theme: themeModeOptions(copy).find((option) => option.value === themeMode)?.label ?? "",
              palette: PALETTES.filter((item) => item.id === palette)
                .map((item) => copy(item.nameTr, item.name))
                .join(""),
              scale: textScale,
            })}
            onPress={() => setPanel("visual")}
          />
          <SelectField
            variant="row"
            icon={tile(Globe)}
            label={copy("Dil", "Language")}
            value={language}
            disabled={!storageHydrated || !!storageError}
            options={[{ value: "system" as const, label: copy("Sistem", "System") }, ...LANGUAGES]}
            onChange={setLanguage}
          />
          <SelectField
            variant="row"
            icon={tile(MessageSquare)}
            label={copy("Ajan çalışırken gönder", "Send while agent is running")}
            value={busySend}
            disabled={!busySendHydrated}
            options={[
              {
                value: "steer" as const,
                label: copy("Yönlendir", "Steer"),
                detail: copy("Çalışan ajana hemen ilet.", "Send to the running agent now."),
              },
              {
                value: "queue" as const,
                label: copy("Sıraya al", "Queue"),
                detail: copy("Ajan bitince gönder.", "Send after the agent finishes."),
              },
            ]}
            onChange={(value) => { void busySendStore.getState().setMode(value); }}
          />
          {busySendError ? <Notice tone="warning" message={copy("Gönderim tercihi okunamadı veya kaydedilemedi. Yeniden seçerek dene.", "The send preference could not be read or saved. Select it again to retry.")} /> : null}
        </NavigationGroup>
        {appearanceError ? (
          <Notice
            tone="warning"
            message={copy(
              "Görünüm tercihi okunamadı veya kaydedilemedi. Yeniden dene veya bir seçim yap.",
              "The appearance preference could not be read or saved. Retry or make a choice.",
            )}
          />
        ) : null}
        {panel === "visual" ? (
          <Sheet visible title={titles.visual} size="full" onClose={() => setPanel(null)}>
            <AppearanceSettings />
          </Sheet>
        ) : null}
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
            onPress={() => router.navigate("/legal/help")}
          />
          <NavigationRow
            label={copy("AI içeriğini bildir", "Report AI content")}
            icon={tile(Flag)}
            onPress={() => router.navigate("/report")}
          />
          <NavigationRow label={titles.about} icon={tile(Info)} onPress={() => setPanel("about")} />
        </NavigationGroup>
      </Section>
      {panel && panel !== "visual" ? (
        <Sheet
          visible
          size={
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
                    router.navigate("/legal/privacy");
                  }}
                />
                <NavigationRow
                  label={copy("Kullanım koşulları ve lisans", "Terms of use & license")}
                  onPress={() => {
                    setPanel(null);
                    router.navigate("/legal/terms");
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
