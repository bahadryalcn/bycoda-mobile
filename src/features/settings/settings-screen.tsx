import { useEffect } from "react";
import { router, type Href } from "expo-router";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { Avatar } from "panelui-native/components/avatar";
import Laptop from "lucide-react-native/icons/laptop";
import Sparkles from "lucide-react-native/icons/sparkles";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import Palette from "lucide-react-native/icons/palette";
import MessageSquare from "lucide-react-native/icons/message-square";
import Bell from "lucide-react-native/icons/bell";
import LockKeyhole from "lucide-react-native/icons/lock-keyhole";
import Smartphone from "lucide-react-native/icons/smartphone";
import Database from "lucide-react-native/icons/database";
import LifeBuoy from "lucide-react-native/icons/life-buoy";
import MessageCircleHeart from "lucide-react-native/icons/message-circle-heart";
import Info from "lucide-react-native/icons/info";
import UserRound from "lucide-react-native/icons/user-round";
import { LANGUAGES } from "../../localization";
import { useActiveMachine, useMachines } from "../../state/machines";
import { storageErrorText } from "@/features/connections/storage-error-copy";
import { useAppearance } from "../../state/appearance";
import { useBusySend } from "../../state/busy-send";
import { useSecurity } from "../../state/security";
import { NavigationGroup, NavigationRow, Screen, Section, SettingIcon, StateView } from "../../ui/primitives";
import { useCopy } from "../../ui/copy";
import { PALETTES } from "@/ui/tokens";
import { graphemes } from "../../../../src/shared/lib/text/truncate";
import { VoiceSettings } from "../voice-settings/voice-settings";
import { useAccount } from "../account/ui/account-context";
import { useAccountMe } from "../account/ui/use-account-me";
import { useDiagnosticPrefs } from "../diagnostics/diagnostics-runtime";
import { appIdentity } from "../engagement/engagement-model";
import { usePermissionReads } from "../permissions/use-permission-reads";
import { appearanceSummary, themeModeOptions } from "./appearance-settings-model";
import { settingsRoutes } from "./settings-routes";
import { identitySummary, notificationSummary, onOffSummary, permissionSummary } from "./settings-summaries";

const go = (route: string) => () => router.navigate(route as Href);

/** The identity row leads the index: who is signed in, or the way to sign in. */
function IdentityRow() {
  const copy = useCopy();
  const account = useAccount();
  const me = useAccountMe();
  const user = me.data?.user;
  const { name, detail } = identitySummary(user);
  const signedIn = account.status === "signedIn";
  const label = signedIn ? name || copy("Hesap", "Account") : copy("Hesap", "Account");
  const value = signedIn
    ? detail ?? (name ? undefined : copy("bycoda hesabı", "bycoda account"))
    : account.status === "loading" ? undefined : copy("Giriş yap", "Sign in");
  return (
    <NavigationRow
      label={label}
      detail={value}
      accessibilityLabel={[copy("Hesap", "Account"), label, value].filter(Boolean).join(". ")}
      icon={signedIn && name ? (
        <Avatar size="sm" source={user?.avatarUrl ? { uri: user.avatarUrl } : undefined}
          fallback={(graphemes(name)[0] ?? "?").toUpperCase()} />
      ) : <SettingIcon glyph={UserRound} />}
      separator={false}
      onPress={go(settingsRoutes.account)}
    />
  );
}

/**
 * Settings index: an identity row and four groups of navigation rows. Every row shows its current
 * value; switches and selects live on the pushed sub-pages, never here.
 */
export function SettingsScreen() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const language = useMachines((s) => s.language);
  const storageError = useMachines((s) => s.storageError);
  const themeMode = useAppearance((s) => s.themeMode);
  const palette = useAppearance((s) => s.palette);
  const textScale = useAppearance((s) => s.typography.scale);
  const busySend = useBusySend((s) => s.mode);
  const lockEnabled = useSecurity((s) => s.enabled);
  const diagnosticMode = useDiagnosticPrefs((s) => s.consent.mode);
  const hydrateDiagnostics = useDiagnosticPrefs((s) => s.hydrate);
  // Reason: the Data and privacy value reads the stored log-sharing choice, not the default.
  useEffect(() => { void hydrateDiagnostics(); }, [hydrateDiagnostics]);
  const reads = usePermissionReads();
  const platform = process.env.EXPO_OS ?? "unknown";
  const version = appIdentity(Constants, platform, Application).version;
  const languageLabel = language === "system"
    ? copy("Sistem", "System")
    : LANGUAGES.find((item) => item.value === language)?.label ?? language;
  const diagnosticsLabel = diagnosticMode === "off"
    ? copy("Günlükler gönderilmez", "Logs not sent")
    : diagnosticMode === "auto"
      ? copy("Günlükler otomatik gönderilir", "Logs sent automatically")
      : copy("Günlükler için sorulur", "Asks before sending logs");
  const native = process.env.EXPO_OS !== "web";
  return (
    <Screen title={copy("Ayarlar", "Settings")}>
      <NavigationGroup>
        <IdentityRow />
      </NavigationGroup>
      <Section title={copy("Bilgisayar", "Computer")}>
        <NavigationGroup>
          <NavigationRow
            label={copy("Bilgisayarlar", "Computers")}
            detail={machine?.name ?? copy("Bağlı değil", "Not connected")}
            icon={<SettingIcon glyph={Laptop} />}
            onPress={go(settingsRoutes.computers)}
          />
          <NavigationRow
            label={copy("Asistan", "Assistant")}
            detail={machine ? undefined : copy("Bilgisayar bağla", "Connect a computer")}
            icon={<SettingIcon glyph={Sparkles} />}
            separator={false}
            onPress={go(settingsRoutes.assistant)}
          />
        </NavigationGroup>
        {storageError ? (
          <StateView
            compact
            tone="warning"
            title={copy("Kaydedilmiş bağlantılar kullanılamıyor", "Saved connections are unavailable")}
            description={storageErrorText(storageError, copy)}
            action={{ label: copy("Depolamayı kurtar", "Recover saved connections"), onPress: go(settingsRoutes.computers) }}
          />
        ) : null}
      </Section>
      <Section title={copy("Uygulama", "App")}>
        <NavigationGroup>
          <NavigationRow
            label={copy("Genel", "General")}
            detail={languageLabel}
            icon={<SettingIcon glyph={SlidersHorizontal} />}
            onPress={go(settingsRoutes.general)}
          />
          <NavigationRow
            label={copy("Görünüm", "Appearance")}
            detail={appearanceSummary({
              theme: themeModeOptions(copy).find((option) => option.value === themeMode)?.label ?? "",
              palette: PALETTES.filter((item) => item.id === palette).map((item) => copy(item.nameTr, item.name)).join(""),
              scale: textScale,
            })}
            icon={<SettingIcon glyph={Palette} />}
            onPress={go(settingsRoutes.appearance)}
          />
          <NavigationRow
            label={copy("Mesajlar", "Messages")}
            detail={busySend === "queue"
              ? copy("Çalışırken: Sıraya al", "While running: Queue")
              : copy("Çalışırken: Yönlendir", "While running: Steer")}
            icon={<SettingIcon glyph={MessageSquare} />}
            onPress={go(settingsRoutes.chat)}
          />
          <VoiceSettings />
          <NavigationRow
            label={copy("Bildirimler", "Notifications")}
            detail={native ? notificationSummary(reads.notifications, copy) : undefined}
            icon={<SettingIcon glyph={Bell} />}
            separator={false}
            onPress={go(settingsRoutes.notifications)}
          />
        </NavigationGroup>
      </Section>
      <Section title={copy("Gizlilik ve güvenlik", "Privacy and security")}>
        <NavigationGroup>
          <NavigationRow
            label={copy("Uygulama kilidi", "App lock")}
            detail={native ? onOffSummary(lockEnabled, copy) : undefined}
            icon={<SettingIcon glyph={LockKeyhole} />}
            onPress={go(settingsRoutes.security)}
          />
          <NavigationRow
            label={copy("Telefon izinleri", "Phone permissions")}
            detail={native ? permissionSummary(reads, copy) : undefined}
            icon={<SettingIcon glyph={Smartphone} />}
            onPress={go(settingsRoutes.permissions)}
          />
          <NavigationRow
            label={copy("Veriler ve gizlilik", "Data and privacy")}
            detail={diagnosticsLabel}
            icon={<SettingIcon glyph={Database} />}
            separator={false}
            onPress={go(settingsRoutes.privacy)}
          />
        </NavigationGroup>
      </Section>
      <Section title={copy("Destek", "Support")}>
        <NavigationGroup>
          <NavigationRow
            label={copy("Yardım ve destek", "Help and support")}
            icon={<SettingIcon glyph={LifeBuoy} />}
            onPress={go(settingsRoutes.help)}
          />
          <NavigationRow
            label={copy("Geri bildirim gönder", "Send feedback")}
            icon={<SettingIcon glyph={MessageCircleHeart} />}
            onPress={go(settingsRoutes.feedback)}
          />
          <NavigationRow
            label={copy("Hakkında", "About")}
            detail={version ?? undefined}
            icon={<SettingIcon glyph={Info} />}
            separator={false}
            onPress={go(settingsRoutes.about)}
          />
        </NavigationGroup>
      </Section>
    </Screen>
  );
}
