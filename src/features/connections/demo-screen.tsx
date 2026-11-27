import { lazy, Suspense, useState } from "react";
import { View } from "react-native";
import { Stack, router } from "expo-router";
import X from "lucide-react-native/icons/x";
import { Button, IconButton, Sheet, Skeleton } from "@/ui/primitives";
import { OnboardingShell } from "@/ui/onboarding-shell";
import { useMobileTheme } from "@/ui/theme";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import { goBack } from "@/ui/navigation";

const TourSample = lazy(() =>
  import("@/ui/component-gallery-chat").then((module) => ({ default: module.TourSampleSheet })),
);
const ComponentGallery = lazy(() =>
  import("@/ui/component-gallery").then((module) => ({ default: module.ComponentGallery })),
);

/** Offline tour: full-screen pages of what the phone does, then pairing or a sample session. */
export function DemoScreen() {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const [sample, setSample] = useState(false);
  const [gallery, setGallery] = useState(false);
  const sheetOpen = sample || gallery;
  const galleryTitle = copy("Bileşen galerisi", "Component gallery");
  const close = () => goBack("/");
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <OnboardingShell
        compactPages
        top={
          <View
            accessibilityElementsHidden={sheetOpen}
            importantForAccessibility={sheetOpen ? "no-hide-descendants" : "auto"}
            pointerEvents={sheetOpen ? "none" : "box-none"}
            style={{ flexDirection: "row", justifyContent: "flex-end", opacity: sheetOpen ? 0 : 1 }}
          >
            <IconButton label={copy("Kapat", "Close")} onPress={close}>
              <X size={22} strokeWidth={2} color={colors.text} />
            </IconButton>
          </View>
        }
        pages={[
          { key: "projects", art: "wave", title: copy("Tüm projelerin elinin altında", "Every project at hand"),
            body: copy("Bilgisayarındaki projeler ve oturumlar tek listede.", "Your computer's projects and sessions in one list.") },
          { key: "live", art: "think", title: copy("Ajanını canlı izle", "Watch your agent work live"),
            body: copy("Her adımı, aracı ve onayı geldiği anda gör.", "See each step, tool and approval as it happens.") },
          { key: "voice", art: "serene", lightArt: "child", title: copy("Sesinle yönet", "Steer it with your voice"),
            body: copy("Konuş; sesin bilgisayarında yazıya dökülür.", "Speak; your computer turns it into text.") },
          { key: "widgets", art: "adult", title: copy("Ana ekranından takip et", "Follow it from your home screen"),
            body: copy("Çalışan ve bekleyen işleri uygulamayı açmadan gör.", "See running and waiting work without opening the app.") },
        ]}
      >
        <View style={{ gap: space.xs }}>
          <Button label={copy("Bilgisayarına bağlan", "Connect your computer")} tone="primary" fullWidth
            onPress={() => router.replace({ pathname: "/machines", params: { start: "scan" } })} />
          <Button label={copy("Örnek oturumu aç", "Open the example session")} tone="quiet" fullWidth
            onPress={() => setSample(true)} />
          {/* Development only: the gallery stays out of the sample so the dev build shows what users see. */}
          {__DEV__ ? <Button label={galleryTitle} tone="quiet" fullWidth onPress={() => setGallery(true)} /> : null}
        </View>
      </OnboardingShell>
      {sample ? (
        <Suspense
          fallback={
            <Sheet visible title={copy("Örnek oturum", "Example session")} onClose={() => setSample(false)}>
              <Skeleton variant="content" />
            </Sheet>
          }
        >
          <TourSample onClose={() => setSample(false)} />
        </Suspense>
      ) : null}
      {__DEV__ && gallery ? (
        <Sheet visible title={galleryTitle} onClose={() => setGallery(false)}>
          <Suspense fallback={<Skeleton variant="content" />}>
            <ComponentGallery />
          </Suspense>
          <Button label={copy("Çalışma alanı test verileri", "Workspace fixtures")} tone="quiet" onPress={() => router.navigate("./dev-workspace")} />
        </Sheet>
      ) : null}
    </>
  );
}
