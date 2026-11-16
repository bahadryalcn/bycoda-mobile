import { useMobileTheme } from "@/ui/theme";
import { ScrollView, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeInDown, ReduceMotion } from "react-native-reanimated";
import { router, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCopy } from "@/ui/copy";
import { AccountComputersSection } from "./account-computers-section";
import { Body, Button, Heading } from "@/ui/primitives";
import { CodeArt, codeArtWidth } from "@/ui/code-art";
import { DotField } from "@/ui/dot-field";
import { fontSize, lineHeight, metrics, space } from "@/ui/tokens";
import { useBottomInset } from "@/ui/layout";

/**
 * First run after sign-in: the website's code-glyph guide, one line on where to start and the scan
 * action. Content scrolls when the account already lists computers.
 */
export function WelcomeScreen() {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();
  const { width, height } = useWindowDimensions();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: copy("Projeler", "Projects") }} />
      <DotField />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          width: "100%",
          maxWidth: metrics.entryWidth,
          alignSelf: "center",
          paddingStart: Math.max(insets.left, space.screen),
          paddingEnd: Math.max(insets.right, space.screen),
          paddingTop: space.lg,
          paddingBottom: Math.max(bottomInset, insets.bottom, space.md) + space.lg,
          gap: space.xl,
        }}
      >
        <Animated.View entering={FadeIn.duration(700).reduceMotion(ReduceMotion.System)}
          style={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}>
          <CodeArt name="guideTip" active width={codeArtWidth("guideTip", { width: width * 0.8, height: height * 0.5 })} />
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(600).delay(300).reduceMotion(ReduceMotion.System)}>
          <AccountComputersSection others={
            <View style={{ gap: space.lg }}>
              <View style={{ gap: space.sm }}>
                <Heading style={[uiStyles.largeTitle, { textAlign: "center", fontSize: fontSize.display, lineHeight: lineHeight.display }]}>
                  {copy("Bilgisayarını bağla", "Connect your computer")}
                </Heading>
                <Body muted style={{ textAlign: "center" }}>
                  {copy("Bilgisayarındaki bycoda’da “Telefon bağla”yı seç ve QR kodunu tara.",
                    "In bycoda on your computer, choose “Connect your phone” and scan the QR code.")}
                </Body>
              </View>
              <View style={{ gap: space.xs }}>
                <Button label={copy("QR kodu tara", "Scan QR code")} tone="primary" fullWidth
                  onPress={() => router.navigate({ pathname: "/machines", params: { start: "scan" } })} />
                <Button label={copy("Uygulamayı keşfet", "Explore the app")} tone="quiet" fullWidth
                  onPress={() => router.navigate("/demo")} />
              </View>
            </View>
          } />
        </Animated.View>
      </ScrollView>
    </View>
  );
}
