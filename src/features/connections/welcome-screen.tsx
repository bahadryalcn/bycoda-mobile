import { useMobileTheme } from "@/ui/theme";
import { ScrollView, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { stillMotion } from "@/ui/motion";
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
  const { width, height, fontScale } = useWindowDimensions();
  const artworkHeight = Math.min(200, height * 0.26) / Math.max(1, fontScale);
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
          justifyContent: "center",
          paddingStart: Math.max(insets.left, space.screen),
          paddingEnd: Math.max(insets.right, space.screen),
          paddingTop: space.lg,
          paddingBottom: Math.max(bottomInset, insets.bottom, space.md) + space.lg,
          gap: space.xl,
        }}
      >
        <Animated.View
          entering={stillMotion ? undefined : FadeIn.duration(300).reduceMotion(ReduceMotion.System)}
          style={{ alignItems: "center" }}
        >
          <CodeArt
            name="guideTip"
            active
            width={codeArtWidth("guideTip", { width: Math.min(width * 0.8, metrics.entryWidth - 2 * space.screen), height: artworkHeight })}
          />
        </Animated.View>
        {/* The page heading leads; the account's computers and the other ways to connect follow it. */}
        <Heading style={[uiStyles.largeTitle, { textAlign: "center", fontSize: fontSize.display, lineHeight: lineHeight.display }]}>
          {copy("Bilgisayarını bağla", "Connect your computer")}
        </Heading>
        <View>
          <AccountComputersSection others={
            <View style={{ gap: space.lg }}>
              <Body muted style={{ textAlign: "center" }}>
                {copy("Bilgisayarındaki bycoda’da “Telefon bağla”yı seç ve QR kodunu tara.",
                  "In bycoda on your computer, choose “Connect your phone” and scan the QR code.")}
              </Body>
              {/* Full-width actions keep a real gap so their 48dp touch areas never overlap. */}
              <View style={{ gap: space.sm }}>
                <Button label={copy("QR kodu tara", "Scan QR code")} tone="primary" fullWidth
                  onPress={() => router.navigate({ pathname: "/machines", params: { start: "scan" } })} />
                <Button label={copy("Kodu yapıştır", "Paste pairing code")} tone="secondary" fullWidth
                  onPress={() => router.navigate({ pathname: "/machines", params: { start: "paste" } })} />
                <Button label={copy("Uygulamayı keşfet", "Explore the app")} tone="quiet" fullWidth
                  onPress={() => router.navigate("/demo")} />
              </View>
            </View>
          } />
        </View>
      </ScrollView>
    </View>
  );
}
