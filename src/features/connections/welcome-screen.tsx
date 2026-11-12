import { useMobileTheme } from "@/ui/theme";
import { ScrollView, View } from "react-native";
import { router, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandLogo, LegalLinks } from "@/ui/brand";
import { useCopy } from "@/ui/copy";
import { AccountComputersSection } from "./account-computers-section";
import { Body, Heading, StateView } from "@/ui/primitives";
import { IconTile } from "@/ui/icon-tile";
import Laptop from "lucide-react-native/icons/laptop";
import FolderOpen from "lucide-react-native/icons/folder-open";
import MessageSquare from "lucide-react-native/icons/message-square";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import { metrics, space } from "@/ui/tokens";

type Benefit = { key: string; icon: typeof Laptop; title: string; detail: string };

/** First run: brand on top, one headline, three benefit rows, primary and secondary actions, legal footer. */
export function WelcomeScreen() {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const insets = useSafeAreaInsets();
  const benefits: Benefit[] = [
    {
      key: "projects",
      icon: FolderOpen,
      title: copy("Projelerine göz at", "Browse your projects"),
      detail: copy("Oturumlarını telefondan takip et.", "Follow your sessions from your phone."),
    },
    {
      key: "respond",
      icon: MessageSquare,
      title: copy("Agentlara yanıt ver", "Answer your agents"),
      detail: copy("Bekleyen soruları hemen yanıtla.", "Reply to pending questions right away."),
    },
    {
      key: "secure",
      icon: ShieldCheck,
      title: copy("Bilgisayarında kalır", "Stays on your computer"),
      detail: copy("Projeler ve komutlar bilgisayarında çalışır.", "Projects and commands run on your computer."),
    },
  ];
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: copy("Projeler", "Projects") }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          width: "100%",
          maxWidth: metrics.entryWidth,
          alignSelf: "center",
          paddingHorizontal: Math.max(insets.left, space.screen),
          paddingTop: space.lg,
          paddingBottom: Math.max(insets.bottom, space.md),
          gap: space.md,
        }}
      >
        <View style={{ alignItems: "center", paddingTop: space.xl }}>
          <BrandLogo centered />
        </View>
        <AccountComputersSection />
        <View style={{ flex: 1, justifyContent: "center", gap: space.lg }}>
          <StateView
            illustration="connect-computer"
            title={copy("Kaldığın yerden devam et.", "Pick up where you left off.")}
            description={copy("Başlamak için bilgisayarında bycoda’yı aç.", "Open bycoda on your computer to get started.")}
            action={{ label: copy("Bilgisayarını bağla", "Connect your computer"), onPress: () => router.push("/machines") }}
            secondaryAction={{ label: copy("Uygulamayı keşfet", "Explore the app"), onPress: () => router.push("/demo") }}
          />
          <View style={{ gap: space.md }} accessibilityRole="list">
            {benefits.map(({ key, icon: Icon, title, detail }) => (
              <View key={key} accessibilityRole="listitem" style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <IconTile>
                  <Icon size={18} strokeWidth={2} color={colors.muted} />
                </IconTile>
                <View style={{ flex: 1, gap: space.xxs }}>
                  <Heading style={uiStyles.title}>{title}</Heading>
                  <Body muted>{detail}</Body>
                </View>
              </View>
            ))}
          </View>
        </View>
        <LegalLinks onOpen={(document) => router.push(`/legal/${document}`)} />
      </ScrollView>
    </View>
  );
}
