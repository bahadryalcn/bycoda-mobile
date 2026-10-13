import { useState } from "react";
import { router } from "expo-router";
import Laptop from "lucide-react-native/icons/laptop";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import LockKeyhole from "lucide-react-native/icons/lock-keyhole";
import LifeBuoy from "lucide-react-native/icons/life-buoy";
import Info from "lucide-react-native/icons/info";
import Type from "lucide-react-native/icons/type";
import { LANGUAGES } from "../../localization";
import { useActiveMachine, useMachines } from "../../state/machines";
import {
  Body,
  NavigationGroup,
  NavigationRow,
  Screen,
  Section,
  SelectField,
  Sheet,
} from "../../ui/primitives";
import { colors } from "../../ui/tokens";
import { uiStyles } from "../../ui/styles";
import { useCopy } from "../../ui/copy";
import { SecuritySettings } from "../security/security-settings";
import { EngagementSettings } from "../engagement/engagement-settings";
import { HostSettingsEditor } from "./host-settings-editor";
import { LocalDataControls } from "./local-data-controls";
import { ChatAppearanceSettings } from "./chat-appearance-settings";

export function SettingsScreen() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const language = useMachines((s) => s.language);
  const setLanguage = useMachines((s) => s.setLanguage);
  const [panel, setPanel] = useState<
    "security" | "host" | "privacy" | "about" | "appearance" | null
  >(null);
  const titles = {
    security: copy("Güvenli erişim", "Secure access"),
    host: copy("Bilgisayardaki görevler", "Tasks on your computer"),
    privacy: copy("Gizlilik ve veriler", "Privacy & data"),
    about: copy("bycoda hakkında", "About bycoda"),
    appearance: copy("Sohbet görünümü", "Chat appearance"),
  };
  return (
    <Screen title={copy("Ayarlar", "Settings")}>
      <Section title={copy("Bağlantılar", "Connections")}>
        <NavigationRow
          label={machine?.name ?? copy("Bilgisayar seçilmedi", "No computer selected")}
          detail={machine?.endpoint ?? copy("Bilgisayar bağla", "Connect a computer")}
          icon={<Laptop size={20} color={colors.muted} />}
          onPress={() => router.push("/machines")}
        />
      </Section>
      <SelectField
        label={copy("Dil", "Language")}
        value={language}
        options={[{ value: "system" as const, label: copy("Sistem", "System") }, ...LANGUAGES]}
        onChange={setLanguage}
      />
      <Section title={copy("Tercihler", "Preferences")}>
        <NavigationGroup>
          <NavigationRow
            label={titles.appearance}
            detail={copy("Mesaj yazı boyutu ve önizleme", "Message text size and preview")}
            icon={<Type size={20} color={colors.muted} />}
            onPress={() => setPanel("appearance")}
          />
          <NavigationRow
            label={titles.security}
            detail={copy("Uygulama kilidi ve biyometri", "App lock and biometrics")}
            icon={<ShieldCheck size={20} color={colors.muted} />}
            onPress={() => setPanel("security")}
          />
          {machine ? (
            <NavigationRow
              label={titles.host}
              detail={copy("Çalışma ve günlük süre sınırları", "Concurrency and daily time limits")}
              icon={<SlidersHorizontal size={20} color={colors.muted} />}
              onPress={() => setPanel("host")}
            />
          ) : null}
          <NavigationRow
            label={titles.privacy}
            detail={copy(
              "İzinler, kayıtlı bilgisayarlar ve taslaklar",
              "Permissions, saved computers and drafts",
            )}
            icon={<LockKeyhole size={20} color={colors.muted} />}
            onPress={() => setPanel("privacy")}
          />
        </NavigationGroup>
      </Section>
      <Section title={copy("Yardım ve destek", "Help & support")}>
        <NavigationGroup>
          <NavigationRow
            label={copy("Yardım ve destek", "Help & support")}
            detail={copy(
              "Bağlantı sorunları ve iletişim",
              "Connection troubleshooting and contact",
            )}
            icon={<LifeBuoy size={20} color={colors.muted} />}
            onPress={() => router.push("/legal/help")}
          />
          <NavigationRow
            label={copy("AI içeriğini bildir", "Report AI content")}
            onPress={() => router.push("/report")}
          />
          <NavigationRow
            label={titles.about}
            detail={copy("Sürüm, paylaşım ve geri bildirim", "Version, sharing and feedback")}
            icon={<Info size={20} color={colors.muted} />}
            onPress={() => setPanel("about")}
          />
        </NavigationGroup>
      </Section>
      {panel ? (
        <Sheet visible size={panel === "appearance" ? "compact" : "form"} title={titles[panel]} onClose={() => setPanel(null)}>
          {panel === "appearance" ? (
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
