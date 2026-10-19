import { useMobileTheme } from "@/ui/theme";
import { lazy, Suspense, useState } from "react";
import { Stack, router } from "expo-router";
import FolderGit2 from "lucide-react-native/icons/folder-git-2";
import Laptop from "lucide-react-native/icons/laptop";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import { View } from "react-native";
import {
  Badge,
  Body,
  Button,
  Card,
  Disclosure,
  Loading,
  NavigationGroup,
  NavigationRow,
  Screen,
  SegmentedControl,
  Section,
} from "../../ui/primitives";
import { IconTile } from "../../ui/icon-tile";
import { colors, space } from "../../ui/tokens";
import { useCopy } from "../../ui/copy";

const ComponentGallery = lazy(() =>
  import("@/ui/component-gallery").then((module) => ({ default: module.ComponentGallery })),
);
const SampleChat = lazy(() =>
  import("@/ui/component-gallery-chat").then((module) => ({ default: module.GalleryChat })),
);

type TourPage = "projects" | "session" | "controls";

export function DemoScreen() {
  useMobileTheme();
  const copy = useCopy();
  const [page, setPage] = useState<TourPage>("projects");
  return (
    <Screen title={copy("Uygulamayı keşfet", "Explore the app")}>
      <Stack.Screen options={{ title: copy("Uygulamayı keşfet", "Explore the app") }} />
      <Badge label={copy("Çevrimdışı örnek", "Offline example")} />
      <Disclosure label={copy("Yardım", "Help")}>
        <Body muted>
          {copy(
            "Bu tur örnek içerik gösterir. Bilgisayara bağlanmaz, komut çalıştırmaz ve veri göndermez.",
            "This tour shows sample content. It does not connect to a computer, run commands or send data.",
          )}
        </Body>
      </Disclosure>
      <SegmentedControl
        label={copy("Tur bölümü", "Tour section")}
        value={page}
        onChange={setPage}
        options={[
          { value: "projects" as const, label: copy("Projeler", "Projects") },
          { value: "session" as const, label: copy("AI oturumu", "AI session") },
          { value: "controls" as const, label: copy("Kontroller", "Controls") },
        ]}
      />
      {page === "projects" ? (
        <>
          <Section title={copy("Örnek bilgisayar", "Example computer")}>
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <IconTile color={colors.muted}>
                  <Laptop size={18} strokeWidth={2} color={colors.muted} />
                </IconTile>
                <Body style={{ flex: 1 }}>
                  {copy("Örnek çalışma bilgisayarı", "Example work computer")}
                </Body>
              </View>
              <Body muted>
                {copy(
                  "Projeler ve agentlar bilgisayarda çalışır. Telefonundan oturumları takip eder, bekleyen soruları yanıtlar ve değişiklikleri incelersin.",
                  "Projects and agents run on your computer. Follow sessions, answer pending questions and inspect changes from your phone.",
                )}
              </Body>
            </Card>
          </Section>
          <Section title={copy("Örnek proje", "Example project")}>
            <NavigationGroup>
              <NavigationRow
                label={copy("Kişisel web sitesi", "Personal website")}
                detail={copy(
                  "Dosyalar, Git değişiklikleri ve AI oturumları proje altında birlikte görünür.",
                  "Files, Git changes and AI sessions are grouped under each project.",
                )}
                detailLines={2}
                icon={
                  <IconTile color={colors.info}>
                    <FolderGit2 size={18} strokeWidth={2} color={colors.info} />
                  </IconTile>
                }
                onPress={() => setPage("session")}
              />
            </NavigationGroup>
          </Section>
        </>
      ) : page === "session" ? (
        <Suspense fallback={<Loading />}>
          <SampleChat />
        </Suspense>
      ) : (
        <>
          <Suspense fallback={<Loading />}>
            <ComponentGallery />
          </Suspense>
          <Section title={copy("Erişim senin kontrolünde", "You control access")}>
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <ShieldCheck size={22} color={colors.success} />
                <Body style={{ flex: 1 }}>
                  {copy(
                    "Bağlantı anahtarı telefonun güvenli depolamasında saklanır. Uygulamayı ekran kilidiyle koruyabilirsin.",
                    "Connection keys stay in your phone’s secure storage. Protect the app with your screen lock.",
                  )}
                </Body>
              </View>
              <Body muted>
                {copy(
                  "Veri paylaşımı izni ve bağlantılar Ayarlar’dan yönetilir. Dosyalar ve sağlayıcı hesapları bağlı bilgisayarında kalır.",
                  "Data sharing permission and connections are managed in Settings. Files and provider accounts stay on your connected computer.",
                )}
              </Body>
            </Card>
          </Section>
          <NavigationGroup>
            <NavigationRow
              label={copy("Gizlilik politikasını oku", "Read the privacy policy")}
              onPress={() => router.push("/legal/privacy")}
            />
          </NavigationGroup>
        </>
      )}
      <Button
        label={copy("Bilgisayarımı bağla", "Connect my computer")}
        tone="primary"
        fullWidth
        onPress={() => router.replace("/machines")}
      />
      <Button
        label={copy("Karşılamaya dön", "Back to welcome")}
        tone="quiet"
        onPress={() => router.replace("/")}
        style={{ alignSelf: "center" }}
      />
    </Screen>
  );
}
