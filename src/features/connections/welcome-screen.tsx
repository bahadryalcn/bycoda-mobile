import { View } from "react-native";
import { router, Stack } from "expo-router";
import ArrowRight from "lucide-react-native/icons/arrow-right";
import ArrowUpRight from "lucide-react-native/icons/arrow-up-right";
import Compass from "lucide-react-native/icons/compass";
import { BrandLogo, LegalLinks } from "@/ui/brand";
import { WorkspacePreview } from "@/ui/workspace-preview";
import { useCopy } from "@/ui/copy";
import { Body, Button, Heading, PressableCard, Screen } from "@/ui/primitives";
import { uiStyles } from "@/ui/styles";
import { colors, fontSize, metrics, space } from "@/ui/tokens";

export function WelcomeScreen() {
  const copy = useCopy();
  return (
    <Screen>
      <Stack.Screen options={{ title: copy("Projeler", "Projects") }} />
      <View
        style={{
          width: "100%",
          maxWidth: metrics.entryWidth,
          alignSelf: "center",
          gap: space.xl,
          paddingTop: space.sm,
        }}
      >
        <BrandLogo compact />
        <View style={{ gap: space.md }}>
          <Heading
            accessibilityRole="header"
            style={{
              fontSize: fontSize.display,
              lineHeight: 38,
              fontWeight: "600",
              letterSpacing: -1,
            }}
          >
            {copy("Kaldığın yerden devam et.", "Pick up where you left off.")}
          </Heading>
          <Body muted>
            {copy(
              "Projelerine göz at, ajanlarına yanıt ver. Başlamak için bilgisayarında bycoda’yı aç.",
              "Browse your projects and respond to your agents. Open bycoda on your computer to get started.",
            )}
          </Body>
        </View>
        <WorkspacePreview />
        <View style={{ gap: space.md }}>
          <Button
            label={copy("Bilgisayarını bağla", "Connect your computer")}
            tone="primary"
            fullWidth
            onPress={() => router.push("/machines")}
          >
            <ArrowRight size={20} color={colors.primaryText} />
          </Button>
        </View>
        <PressableCard
          label={copy("Uygulamayı keşfet", "Explore the app")}
          onPress={() => router.push("/demo")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space.md,
            backgroundColor: colors.background,
            borderWidth: 0,
            paddingHorizontal: 0,
            paddingVertical: space.xs,
          }}
        >
          <Compass size={22} color={colors.muted} />
          <View style={[uiStyles.grow, { gap: space.xxs }]}>
            <Body style={uiStyles.label}>{copy("Uygulamayı keşfet", "Explore the app")}</Body>
            <Body muted style={{ fontSize: fontSize.small, lineHeight: 19 }}>
              {copy("Bağlanmadan önce bir göz at.", "Take a look before connecting.")}
            </Body>
          </View>
          <ArrowUpRight size={18} color={colors.muted} />
        </PressableCard>
        <LegalLinks onOpen={(document) => router.push(`/legal/${document}`)} />
      </View>
    </Screen>
  );
}
