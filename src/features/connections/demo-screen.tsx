import { useState } from "react";
import { Stack, router } from "expo-router";
import FolderGit2 from "lucide-react-native/icons/folder-git-2";
import Laptop from "lucide-react-native/icons/laptop";
import MessageSquare from "lucide-react-native/icons/message-square";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import { Brand } from "../../ui/brand";
import {
  Badge,
  Body,
  Button,
  Card,
  ChoiceChip,
  Heading,
  Row,
  Screen,
  Section,
} from "../../ui/primitives";
import { colors } from "../../ui/tokens";
import { useCopy } from "../../ui/copy";

export function DemoScreen() {
  const copy = useCopy();
  const [page, setPage] = useState<"projects" | "session" | "controls">("projects");
  return (
    <Screen title={copy("Uygulamayı keşfet", "Explore the app")}>
      <Stack.Screen options={{ title: copy("Uygulamayı keşfet", "Explore the app") }} />
      <Brand compact />
      <Badge label={copy("Çevrimdışı örnek", "Offline example")} />
      <Body muted>
        {copy(
          "Bu tur örnek içerik gösterir. Bilgisayara bağlanmaz, komut çalıştırmaz ve veri göndermez. Kendi projelerin için bycoda çalışan bir bilgisayar bağlaman gerekir.",
          "This tour shows sample content. It does not connect to a computer, run commands or send data. Connect a computer running bycoda to work with your own projects.",
        )}
      </Body>
      <Row>
        <ChoiceChip
          label={copy("Projeler", "Projects")}
          selected={page === "projects"}
          onPress={() => setPage("projects")}
        />
        <ChoiceChip
          label={copy("AI oturumu", "AI session")}
          selected={page === "session"}
          onPress={() => setPage("session")}
        />
        <ChoiceChip
          label={copy("Kontroller", "Controls")}
          selected={page === "controls"}
          onPress={() => setPage("controls")}
        />
      </Row>
      {page === "projects" ? (
        <>
          <Card>
            <Row>
              <Laptop color={colors.muted} size={22} />
              <Heading>{copy("Örnek çalışma bilgisayarı", "Example work computer")}</Heading>
            </Row>
            <Body muted>
              {copy(
                "Projeler ve agentlar bilgisayarda çalışır. Telefonundan oturumları takip eder, bekleyen soruları yanıtlar ve değişiklikleri incelersin.",
                "Projects and agents run on your computer. Follow sessions, answer pending questions and inspect changes from your phone.",
              )}
            </Body>
          </Card>
          <Section title={copy("Örnek proje", "Example project")}>
            <Card>
              <Row>
                <FolderGit2 color={colors.muted} size={22} />
                <Heading>{copy("Kişisel web sitesi", "Personal website")}</Heading>
              </Row>
              <Body muted>
                {copy(
                  "Bir proje altında dosyalar, Git değişiklikleri ve AI oturumları birlikte görünür.",
                  "Files, Git changes and AI sessions are grouped under each project.",
                )}
              </Body>
              <Button
                label={copy("Örnek oturumu aç", "Open sample session")}
                onPress={() => setPage("session")}
              />
            </Card>
          </Section>
        </>
      ) : page === "session" ? (
        <>
          <Row>
            <MessageSquare color={colors.muted} size={22} />
            <Heading>{copy("Örnek konuşma", "Sample conversation")}</Heading>
          </Row>
          <Card>
            <Badge label={copy("Sen · örnek mesaj", "You · sample message")} />
            <Body>
              {copy(
                "İletişim sayfasına erişilebilir bir form ekle.",
                "Add an accessible form to the contact page.",
              )}
            </Body>
          </Card>
          <Card>
            <Badge label={copy("Agent · örnek yanıt", "Agent · sample response")} />
            <Body>
              {copy(
                "Form alanlarını ve hata açıklamalarını hazırladım. Değişiklikleri inceleyip sonraki adımı seçebilirsin.",
                "The form fields and error descriptions are ready. Review the changes and choose the next step.",
              )}
            </Body>
            <Body muted>
              {copy(
                "Gerçek oturumda mesaj gönderme, çalışan işi durdurma ve izin sorularını yanıtlama kontrolleri vardır. AI yanıtlarını uygulamadan önce doğrula.",
                "Real sessions include messaging, stopping work and answering permission requests. Verify AI output before applying it.",
              )}
            </Body>
          </Card>
        </>
      ) : (
        <>
          <Row>
            <ShieldCheck color={colors.success} size={22} />
            <Heading>{copy("Erişim senin kontrolünde", "You control access")}</Heading>
          </Row>
          <Card>
            <Body>
              {copy(
                "Bağlantı anahtarı native uygulamada telefonun güvenli depolamasında saklanır. Telefonun ekran kilidiyle uygulamayı koruyabilir ve birden fazla bilgisayarı ayrı yönetebilirsin.",
                "The native app stores connection keys in your phone’s secure storage. Protect the app with your phone’s screen lock and manage several computers separately.",
              )}
            </Body>
            <Body muted>
              {copy(
                "Veri paylaşımı izni, bağlantı kaldırma ve yerel taslak silme Ayarlar’dan yönetilir. Dosyalar ve sağlayıcı hesapları bağlı bilgisayarında kalır.",
                "Manage data sharing permission, saved connections and local draft deletion in Settings. Files and provider accounts stay on your connected computer.",
              )}
            </Body>
          </Card>
          <Button
            label={copy("Gizlilik politikasını oku", "Read the privacy policy")}
            onPress={() => router.push("/legal/privacy")}
          />
        </>
      )}
      <Button
        label={copy("Bilgisayarımı bağla", "Connect my computer")}
        tone="primary"
        onPress={() => router.replace("/machines")}
      />
      <Button
        label={copy("Karşılamaya dön", "Back to welcome")}
        onPress={() => router.replace("/")}
      />
    </Screen>
  );
}
