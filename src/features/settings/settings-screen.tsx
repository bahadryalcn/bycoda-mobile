import { useMobileTheme } from "@/ui/theme";
import { useState, type PropsWithChildren } from "react";
import { router, type Href } from "expo-router";
import Laptop from "lucide-react-native/icons/laptop";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import Smartphone from "lucide-react-native/icons/smartphone";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import LockKeyhole from "lucide-react-native/icons/lock-keyhole";
import LifeBuoy from "lucide-react-native/icons/life-buoy";
import Info from "lucide-react-native/icons/info";
import Palette from "lucide-react-native/icons/palette";
import MessageSquare from "lucide-react-native/icons/message-square";
import Globe from "lucide-react-native/icons/globe";
import Gauge from "lucide-react-native/icons/gauge";
import Flag from "lucide-react-native/icons/flag";
import Scale from "lucide-react-native/icons/scale";
import UserRound from "lucide-react-native/icons/user-round";
import LayoutGrid from "lucide-react-native/icons/layout-grid";
import { IconTile } from "../../ui/icon-tile";
import { LANGUAGES } from "../../localization";
import { useActiveMachine, useMachines } from "../../state/machines";
import { reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import { useAppearance } from "../../state/appearance";
import { busySendStore, useBusySend } from "../../state/busy-send";
import { dataSaverStore, useDataSaver } from "../../state/data-saver";
import {
  Body,
  NavigationGroup,
  NavigationRow,
  Notice,
  Screen,
  SelectField,
  Sheet,
  StateView,
  Stack,
} from "../../ui/primitives";
import { useCopy } from "../../ui/copy";
import { SecuritySettings } from "../security/security-settings";
import { EngagementSettings } from "../engagement/engagement-settings";
import { UpdatesRow } from "../updates/UpdatesRow";
import { KeyboardSettings } from "../keyboard/keyboard-preferences";
import { NavigationSettings } from "../navigation-prefs/navigation-settings";
import { VoiceSettings } from "../voice-settings/voice-settings";
import { HostSettingsEditor } from "./host-settings-editor";
import { LocalDataControls } from "./local-data-controls";
import { DiagnosticsSettings } from "../diagnostics/DiagnosticsSettings";
import { AppearanceSettings } from "./appearance-settings";
import { appearanceSummary, themeModeOptions } from "./appearance-settings-model";
import { PALETTES, space } from "@/ui/tokens";
import { WidgetSettings } from "../widgets";
import { DevicePermissionSettings } from "../permissions/device-permission-settings";
import { leaveSheetThen } from "./sheet-navigation";

function SettingsGroup({ title, children }: PropsWithChildren<{ title: string }>) {
  const { uiStyles } = useMobileTheme();
  return (
    <Stack style={{ gap: space.xs, marginBottom: space.xs }}>
      <Body accessibilityRole="header" muted style={uiStyles.sectionLabel}>{title}</Body>
      {children}
    </Stack>
  );
}

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
  const dataSaver = useDataSaver((s) => s.dataSaver);
  const dataSaverHydrated = useDataSaver((s) => s.hydrated);
  const dataSaverError = useDataSaver((s) => s.storageError);
  const [panel, setPanel] = useState<
    "security" | "host" | "privacy" | "about" | "visual" | "permissions" | "widgets" | null
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
    widgets: copy("Widget'lar", "Widgets"),
  };
  const leaveSheet = (go: () => void) => leaveSheetThen(() => setPanel(null), go);
  const tile = (Glyph: typeof Laptop) => (
    <IconTile color={colors.muted}>
      <Glyph size={18} strokeWidth={2} color={colors.muted} />
    </IconTile>
  );
  return (
    <Screen title={copy("Ayarlar", "Settings")}>
      <SettingsGroup title={copy("Bağlantılar", "Connections")}>
        <NavigationGroup>
          <NavigationRow
            label={copy("bycoda hesabı", "bycoda account")}
            icon={tile(UserRound)}
            onPress={() => router.navigate("/account" as Href)}
          />
          <NavigationRow
            label={copy("Bağlantıları yönet", "Manage connections")}
            detail={machine?.name ?? copy("Bilgisayar bağla", "Connect a computer")}
            icon={tile(Laptop)}
            separator={!!machine}
            onPress={() => router.navigate("/machines")}
          />
          {machine ? (
            <NavigationRow
              label={titles.host}
              detail={`${copy("Görev sınırları", "Task limits")} · ${copy("Ajan varsayılanları", "Agent defaults")}`}
              separator={false}
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
      </SettingsGroup>
      <SettingsGroup title={copy("Tercihler", "Preferences")}>
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
            icon={tile(Gauge)}
            label={copy("Veri tasarrufu", "Data saver")}
            value={dataSaver}
            disabled={!dataSaverHydrated}
            options={[
              {
                value: "auto" as const,
                label: copy("Otomatik", "Auto"),
                detail: copy("Mobil veride tasarruf et.", "Save data on cellular."),
              },
              {
                value: "on" as const,
                label: copy("Her zaman", "Always"),
                detail: copy(
                  "Görseller dokununca yüklenir. Tarayıcı yayını daha az veri kullanır.",
                  "Load images on tap and use less data for browser streaming.",
                ),
              },
              { value: "off" as const, label: copy("Kapalı", "Off") },
            ]}
            onChange={(value) => { void dataSaverStore.getState().setDataSaver(value); }}
          />
          <KeyboardSettings />
          <NavigationRow label={titles.widgets} icon={tile(LayoutGrid)} separator={false} onPress={() => setPanel("widgets")} />
        </NavigationGroup>
        {dataSaverError ? <Notice tone="warning" message={copy("Veri tasarrufu tercihi okunamadı veya kaydedilemedi. Yeniden seçerek dene.", "The data saver preference could not be read or saved. Select it again to retry.")} /> : null}
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
      </SettingsGroup>
      <SettingsGroup title={copy("Sohbet", "Chat")}>
        <NavigationGroup>
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
                detail: copy("Mesajı çalışan ajana hemen ilet.", "Send to the running agent now."),
              },
              {
                value: "queue" as const,
                label: copy("Sıraya al", "Queue"),
                detail: copy("Ajan bitirdiğinde gönder.", "Send after the agent finishes."),
              },
            ]}
            onChange={(value) => { void busySendStore.getState().setMode(value); }}
          />
          <VoiceSettings />
        </NavigationGroup>
        {busySendError ? <Notice tone="warning" message={copy("Gönderim tercihi okunamadı veya kaydedilemedi. Yeniden seçerek dene.", "The send preference could not be read or saved. Select it again to retry.")} /> : null}
      </SettingsGroup>
      <SettingsGroup title={copy("Gezinme", "Navigation")}>
        <NavigationSettings />
      </SettingsGroup>
      <SettingsGroup title={copy("Erişim ve gizlilik", "Access & privacy")}>
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
          <NavigationRow
            label={titles.privacy}
            icon={tile(LockKeyhole)}
            separator={false}
            onPress={() => setPanel("privacy")}
          />
        </NavigationGroup>
      </SettingsGroup>
      <SettingsGroup title={copy("Destek", "Support")}>
        <NavigationGroup>
          <NavigationRow
            label={copy("Yardım ve destek", "Help & support")}
            icon={tile(LifeBuoy)}
            onPress={() => router.navigate("/legal/help")}
          />
          <NavigationRow
            label={copy("İçerik bildir", "Report content")}
            icon={tile(Flag)}
            onPress={() => router.navigate("/report")}
          />
          <NavigationRow label={titles.about} icon={tile(Info)} onPress={() => setPanel("about")} />
          <NavigationRow label={copy("Açık kaynak lisansları", "Open-source licenses")} icon={tile(Scale)} separator={false} onPress={() => router.navigate("/licenses")} />
        </NavigationGroup>
      </SettingsGroup>
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
          ) : panel === "widgets" ? (
            <NavigationGroup><WidgetSettings /></NavigationGroup>
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
                  onPress={() => leaveSheet(() => router.navigate("/legal/privacy"))}
                />
                <NavigationRow
                  label={copy("Kullanım koşulları ve lisans", "Terms of use & license")}
                  onPress={() => leaveSheet(() => router.navigate("/legal/terms"))}
                />
              </NavigationGroup>
              <DiagnosticsSettings />
              <LocalDataControls />
            </>
          ) : (
            <>
              <EngagementSettings leaveSheet={leaveSheet} />
              <UpdatesRow />
            </>
          )}
        </Sheet>
      ) : null}
    </Screen>
  );
}
