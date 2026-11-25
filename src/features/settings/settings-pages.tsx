import { Linking } from "react-native";
import { router, type Href } from "expo-router";
import Globe from "lucide-react-native/icons/globe";
import Gauge from "lucide-react-native/icons/gauge";
import LayoutGrid from "lucide-react-native/icons/layout-grid";
import MessageSquare from "lucide-react-native/icons/message-square";
import BookOpen from "lucide-react-native/icons/book-open";
import Mail from "lucide-react-native/icons/mail";
import Flag from "lucide-react-native/icons/flag";
import FileText from "lucide-react-native/icons/file-text";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import Scale from "lucide-react-native/icons/scale";
import ScrollText from "lucide-react-native/icons/scroll-text";
import { LANGUAGES } from "../../localization";
import { useActiveMachine, useMachines } from "../../state/machines";
import { reviewedMachine } from "@/state/reviewed-machine";
import { busySendStore, useBusySend } from "../../state/busy-send";
import { dataSaverStore, useDataSaver } from "../../state/data-saver";
import { NavigationGroup, NavigationRow, Notice, Section, SelectField, SettingIcon, StateView } from "../../ui/primitives";
import { useCopy } from "../../ui/copy";
import { SecuritySettings } from "../security/security-settings";
import { EngagementSettings } from "../engagement/engagement-settings";
import { UpdatesRow } from "../updates/UpdatesRow";
import { KeyboardSettings } from "../keyboard/keyboard-preferences";
import { NavigationSettings } from "../navigation-prefs/navigation-settings";
import { WidgetSettings } from "../widgets";
import { DevicePermissionSettings } from "../permissions/device-permission-settings";
import { DiagnosticsSettings } from "../diagnostics/DiagnosticsSettings";
import { supportEmail } from "../legal/legal-content";
import { HostSettingsEditor } from "./host-settings-editor";
import { LocalDataControls } from "./local-data-controls";
import { AppearanceSettings } from "./appearance-settings";
import { SettingsPage } from "./settings-page";
import { settingsRoutes } from "./settings-routes";

const go = (route: string) => () => router.navigate(route as Href);

/** Settings → General: language, data saver, dock tabs, new-session default and widgets. */
export function GeneralSettingsPage() {
  const copy = useCopy();
  const language = useMachines((s) => s.language);
  const setLanguage = useMachines((s) => s.setLanguage);
  const storageError = useMachines((s) => s.storageError);
  const storageHydrated = useMachines((s) => s.hydrated);
  const dataSaver = useDataSaver((s) => s.dataSaver);
  const dataSaverHydrated = useDataSaver((s) => s.hydrated);
  const dataSaverError = useDataSaver((s) => s.storageError);
  return (
    <SettingsPage title={copy("Genel", "General")}>
      <Section title={copy("Dil ve veri", "Language and data")}>
        <NavigationGroup>
          <SelectField
            variant="row"
            icon={<SettingIcon glyph={Globe} />}
            label={copy("Dil", "Language")}
            value={language}
            disabled={!storageHydrated || !!storageError}
            options={[{ value: "system" as const, label: copy("Sistem", "System") }, ...LANGUAGES]}
            onChange={setLanguage}
          />
          <SelectField
            variant="row"
            icon={<SettingIcon glyph={Gauge} />}
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
              {
                value: "off" as const,
                label: copy("Kapalı", "Off"),
                detail: copy("Görseller ve yayın tam kalitede yüklenir.", "Images and streaming load at full quality."),
              },
            ]}
            onChange={(value) => { void dataSaverStore.getState().setDataSaver(value); }}
          />
        </NavigationGroup>
        {dataSaverError ? <Notice tone="warning" message={copy("Veri tasarrufu tercihi okunamadı veya kaydedilemedi. Yeniden seçerek dene.", "The data saver preference could not be read or saved. Select it again to retry.")} /> : null}
      </Section>
      <Section title={copy("Gezinme", "Navigation")}>
        <NavigationSettings />
      </Section>
      <Section title={copy("Widget'lar", "Widgets")}>
        <NavigationGroup><WidgetSettings /></NavigationGroup>
      </Section>
    </SettingsPage>
  );
}

/** Settings → Appearance: theme, palette, preview, typography and chat text. */
export function AppearanceSettingsPage() {
  const copy = useCopy();
  return (
    <SettingsPage title={copy("Görünüm", "Appearance")}>
      <AppearanceSettings />
    </SettingsPage>
  );
}

/** Settings → Chat: what Send does while an agent runs, and hardware keyboard Enter. */
export function ChatSettingsPage() {
  const copy = useCopy();
  const busySend = useBusySend((s) => s.mode);
  const busySendHydrated = useBusySend((s) => s.hydrated);
  const busySendError = useBusySend((s) => s.storageError);
  return (
    <SettingsPage title={copy("Sohbet", "Chat")}>
      <NavigationGroup>
        <SelectField
          variant="row"
          icon={<SettingIcon glyph={MessageSquare} />}
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
        <KeyboardSettings />
      </NavigationGroup>
      {busySendError ? <Notice tone="warning" message={copy("Gönderim tercihi okunamadı veya kaydedilemedi. Yeniden seçerek dene.", "The send preference could not be read or saved. Select it again to retry.")} /> : null}
    </SettingsPage>
  );
}

/** Settings → App lock. */
export function SecuritySettingsPage() {
  const copy = useCopy();
  return (
    <SettingsPage title={copy("Uygulama kilidi", "App lock")}>
      <SecuritySettings />
    </SettingsPage>
  );
}

/** Settings → Phone permissions: camera, microphone, notifications and the system picker. */
export function PermissionsSettingsPage() {
  const copy = useCopy();
  return (
    <SettingsPage title={copy("Telefon izinleri", "Phone permissions")}>
      <DevicePermissionSettings />
    </SettingsPage>
  );
}

/** Settings → Data and privacy: diagnostics, data sharing permission, storage and removals. */
export function PrivacySettingsPage() {
  const copy = useCopy();
  return (
    <SettingsPage title={copy("Veriler ve gizlilik", "Data and privacy")}>
      <DiagnosticsSettings />
      <LocalDataControls />
    </SettingsPage>
  );
}

/** Settings → About: version, updates, public links and the legal documents. */
export function AboutSettingsPage() {
  const copy = useCopy();
  return (
    <SettingsPage title={copy("Hakkında", "About")}>
      <EngagementSettings />
      <UpdatesRow />
      <Section title={copy("Yasal", "Legal")}>
        <NavigationGroup>
          <NavigationRow label={copy("Gizlilik politikası", "Privacy policy")} icon={<SettingIcon glyph={ShieldCheck} />}
            onPress={go("/legal/privacy")} />
          <NavigationRow label={copy("Kullanım koşulları ve lisans", "Terms of use & license")} icon={<SettingIcon glyph={ScrollText} />}
            onPress={go("/legal/terms")} />
          <NavigationRow label={copy("Açık kaynak lisansları", "Open-source licenses")} icon={<SettingIcon glyph={Scale} />}
            separator={false} onPress={go("/licenses")} />
        </NavigationGroup>
      </Section>
    </SettingsPage>
  );
}

/** Settings → Help and support: guides, contact, content reports and troubleshooting. */
export function HelpSettingsPage() {
  const copy = useCopy();
  return (
    <SettingsPage title={copy("Yardım ve destek", "Help and support")}>
      <Section title={copy("Yardım", "Help")}>
        <NavigationGroup>
          <NavigationRow label={copy("Yardım ve sık sorulanlar", "Help and FAQ")} icon={<SettingIcon glyph={BookOpen} />}
            onPress={go("/legal/help")} />
          <NavigationRow label={copy("E-posta ile ulaş", "Contact by e-mail")} detail={supportEmail} intent="command"
            icon={<SettingIcon glyph={Mail} />} separator={false}
            onPress={() => { void Linking.openURL(`mailto:${supportEmail}`).catch(() => undefined); }} />
        </NavigationGroup>
      </Section>
      <Section title={copy("Sorun bildir", "Report a problem")}>
        <NavigationGroup>
          <NavigationRow label={copy("Yapay zekâ içeriğini şikâyet et", "Report AI content")} icon={<SettingIcon glyph={Flag} />}
            onPress={go("/report")} />
          <NavigationRow label={copy("Tanılama günlükleri", "Diagnostic logs")}
            detail={copy("Günlükleri gönder, çökme kaydını kopyala", "Send logs, copy the crash log")}
            icon={<SettingIcon glyph={FileText} />} separator={false} onPress={go(settingsRoutes.privacy)} />
        </NavigationGroup>
      </Section>
    </SettingsPage>
  );
}

/**
 * Settings → Agents and tasks: the active computer's task limits, work caps, agent defaults and
 * shell profile. The row stays on the index without a computer; this page then explains why.
 */
export function AgentsSettingsPage() {
  const copy = useCopy();
  const machine = useActiveMachine();
  return (
    <SettingsPage title={copy("Ajanlar ve görevler", "Agents and tasks")} scope={machine ? { computer: machine.name } : undefined}>
      {machine ? (
        <HostSettingsEditor key={machine.id} machineId={machine.id} machineName={machine.name} target={reviewedMachine(machine)} />
      ) : (
        <StateView
          tone="info"
          title={copy("Önce bir bilgisayar bağla", "Connect a computer first")}
          description={copy("Görev sınırları ve ajan varsayılanları bağlı bilgisayarında tutulur.", "Task limits and agent defaults are kept on your connected computer.")}
          action={{ label: copy("Bilgisayar bağla", "Connect a computer"), onPress: go(settingsRoutes.computers) }}
        />
      )}
    </SettingsPage>
  );
}
