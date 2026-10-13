import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { BackHandler, Modal, ScrollView, StyleSheet, View } from "react-native";
import LockKeyhole from "lucide-react-native/icons/lock-keyhole";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import { useSecurity } from "../../state/security";
import {
  Body,
  Button,
  Card,
  ErrorText,
  Heading,
  IconButton,
  Loading,
  Row,
  Screen,
  Stack,
} from "../../ui/primitives";
import { uiStyles } from "../../ui/styles";
import { colors, metrics, space } from "../../ui/tokens";
import { useCopy } from "../../ui/copy";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandLogo, LegalLinks, type LegalLinkTarget } from "../../ui/brand";
import { LegalDocument, legalDocumentTitle } from "../legal/legal-document";

export function useSecurityError() {
  const copy = useCopy();
  return (error: string | null) =>
    error === "storage"
      ? copy(
          "Güvenlik ayarı okunamadı veya kaydedilemedi. Yeniden dene.",
          "The security setting could not be read or saved. Try again.",
        )
      : error === "not-secured"
        ? copy(
            "Telefonunda önce ekran kilidi veya biyometriyi ayarla.",
            "Set up a screen lock or biometrics on your phone first.",
          )
        : error === "cancelled"
          ? copy(
              "Giriş iptal edildi. Tekrar deneyebilirsin.",
              "Unlock cancelled. You can try again.",
            )
          : error === "background"
            ? copy("Uygulamaya dönüp tekrar giriş yap.", "Return to the app and unlock again.")
            : error
              ? copy(
                  "Giriş doğrulanamadı. Tekrar dene.",
                  "Could not verify your identity. Try again.",
                )
              : null;
}

export function SecurityGate({ children }: PropsWithChildren) {
  const security = useSecurity();
  const copy = useCopy();
  const describeError = useSecurityError();
  const insets = useSafeAreaInsets();
  const opened = useRef(false);
  const [document, setDocument] = useState<LegalLinkTarget | null>(null);
  useEffect(() => {
    void security.initialize();
  }, [security.initialize]);
  useEffect(() => {
    if (security.status !== "locked") setDocument(null);
  }, [security.status]);
  useEffect(() => {
    if (process.env.EXPO_OS !== "android") return;
    const back = BackHandler.addEventListener(
      "hardwareBackPress",
      () => useSecurity.getState().status !== "unlocked",
    );
    return () => back.remove();
  }, []);
  if (security.status === "unlocked") opened.current = true;
  const content = (
    <View style={uiStyles.screen}>
      <ScrollView
        style={uiStyles.screen}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingTop: insets.top + space.lg,
          paddingBottom: insets.bottom + space.lg,
          paddingLeft: Math.max(insets.left, space.screen),
          paddingRight: Math.max(insets.right, space.screen),
        }}
      >
        <Stack
          style={{
            width: "100%",
            maxWidth: metrics.entryWidth,
            alignSelf: "center",
            gap: space.lg,
          }}
        >
          <View style={{ alignItems: "center" }}>
            <BrandLogo compact />
          </View>
          {security.status === "suspended" ? (
            <Card>
              <Row>
                <LockKeyhole size={20} color={colors.muted} />
                <Heading style={[uiStyles.title, uiStyles.grow]}>
                  {copy("Çalışma alanın gizlendi", "Your workspace is hidden")}
                </Heading>
              </Row>
              <Body muted>
                {copy(
                  "Uygulamaya döndüğünde güvenli erişimin kontrol edilir.",
                  "Secure access will be checked when you return to the app.",
                )}
              </Body>
            </Card>
          ) : security.status === "loading" ? (
            <Loading label={copy("Güvenlik kontrol ediliyor…", "Checking security…")} centered />
          ) : (
            <Card style={{ padding: space.lg, gap: space.md }}>
              <Row>
                <LockKeyhole size={20} color={colors.accent} />
                <Heading style={[uiStyles.title, uiStyles.grow]}>
                  {copy("bycoda kilitli", "bycoda is locked")}
                </Heading>
              </Row>
              <Body muted>
                {copy(
                  "Bilgisayarlarına erişmek için telefonunun ekran kilidini veya biyometrisini kullan.",
                  "Use your phone’s screen lock or biometrics to access your computers.",
                )}
              </Body>
              <ErrorText
                error={security.error}
                message={describeError(security.error) ?? undefined}
              />
              <Button
                label={
                  security.error === "storage"
                    ? copy("Yeniden dene", "Retry")
                    : copy("Kilidi aç", "Unlock")
                }
                tone="primary"
                busy={security.busy}
                onPress={() => {
                  if (security.error === "storage") void security.initialize();
                  else void security.unlock(copy("bycoda güvenli giriş", "Unlock bycoda"));
                }}
              />
            </Card>
          )}
          {security.status !== "suspended" ? <LegalLinks onOpen={setDocument} /> : null}
        </Stack>
      </ScrollView>
      <Modal
        visible={document !== null && security.status === "locked"}
        animationType="none"
        presentationStyle="fullScreen"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setDocument(null)}
      >
        <View style={uiStyles.screen}>
          <View
            style={{
              paddingTop: insets.top,
              backgroundColor: colors.panel,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Row
              style={{
                paddingLeft: Math.max(space.screen, insets.left),
                paddingRight: Math.max(space.screen, insets.right),
                paddingVertical: space.xs,
                flexWrap: "nowrap",
              }}
            >
              <IconButton label={copy("Geri dön", "Go back")} onPress={() => setDocument(null)}>
                <ArrowLeft size={20} color={colors.text} />
              </IconButton>
              <Heading style={[uiStyles.title, uiStyles.grow]}>
                {document ? legalDocumentTitle(document, copy) : undefined}
              </Heading>
            </Row>
          </View>
          <Screen>{document ? <LegalDocument document={document} /> : null}</Screen>
        </View>
      </Modal>
    </View>
  );
  // Keep an opened workspace mounted so an automatic lock preserves local edits.
  // Keep the lock in the activity window so returning native authentication
  // can restore focus before access is granted. Private sheets hide while locked.
  return (
    <View style={uiStyles.screen}>
      {opened.current ? (
        <View
          style={[uiStyles.screen, { display: security.status === "unlocked" ? "flex" : "none" }]}
          pointerEvents={security.status === "unlocked" ? "auto" : "none"}
          accessibilityElementsHidden={security.status !== "unlocked"}
          importantForAccessibility={
            security.status === "unlocked" ? "auto" : "no-hide-descendants"
          }
        >
          {children}
        </View>
      ) : null}
      {!opened.current ? (
        content
      ) : security.status !== "unlocked" ? (
        <View
          style={[StyleSheet.absoluteFill, uiStyles.screen]}
          pointerEvents="auto"
          accessibilityViewIsModal
        >
          {content}
        </View>
      ) : null}
    </View>
  );
}
