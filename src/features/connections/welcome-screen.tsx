import { useMobileTheme } from "@/ui/theme";
import { Text, View } from "react-native";
import { router, Stack } from "expo-router";
import Animated from "react-native-reanimated";
import { BrandLogo, LegalLinks } from "@/ui/brand";
import { WorkspacePreview } from "@/ui/workspace-preview";
import { useCopy } from "@/ui/copy";
import { Body, Button, Screen } from "@/ui/primitives";
import { enterItem } from "@/ui/motion";
import { uiStyles } from "@/ui/styles";
import { metrics, space } from "@/ui/tokens";

export function WelcomeScreen() {
  useMobileTheme();
  const copy = useCopy();
  return (
    <Screen>
      <Stack.Screen options={{ title: copy("Projeler", "Projects") }} />
      <View
        style={{
          width: "100%",
          maxWidth: metrics.entryWidth,
          alignSelf: "center",
          gap: space.lg,
          paddingTop: space.lg,
        }}
      >
        <Animated.View entering={enterItem(0)} style={{ alignItems: "center" }}>
          <BrandLogo compact />
        </Animated.View>
        <Animated.View entering={enterItem(1)} style={{ gap: space.sm }}>
          <Text selectable accessibilityRole="header" style={uiStyles.largeTitle}>
            {copy("Kaldığın yerden devam et.", "Pick up where you left off.")}
          </Text>
          <Body muted>
            {copy(
              "Projelerine göz at, ajanlarına yanıt ver. Başlamak için bilgisayarında bycoda’yı aç.",
              "Browse your projects and respond to your agents. Open bycoda on your computer to get started.",
            )}
          </Body>
        </Animated.View>
        <Animated.View entering={enterItem(2)} style={{ gap: space.sm }}>
          <Button
            label={copy("Bilgisayarını bağla", "Connect your computer")}
            tone="primary"
            fullWidth
            onPress={() => router.push("/machines")}
          />
          <Button
            label={copy("Uygulamayı keşfet", "Explore the app")}
            tone="quiet"
            onPress={() => router.push("/demo")}
            style={{ alignSelf: "center" }}
          />
        </Animated.View>
        <Animated.View entering={enterItem(3)}>
          <WorkspacePreview />
        </Animated.View>
        <Animated.View entering={enterItem(4)}>
          <LegalLinks onOpen={(document) => router.push(`/legal/${document}`)} />
        </Animated.View>
      </View>
    </Screen>
  );
}
