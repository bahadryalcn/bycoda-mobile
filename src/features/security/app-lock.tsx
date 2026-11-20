import { useMobileTheme } from "@/ui/theme";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { Modal, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useBackHandler } from "panelui-native/hooks/use-back-handler";
import Animated from "react-native-reanimated";
import { enterItem } from "../../ui/motion";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import { useSecurity } from "../../state/security";
import {
  Body,
  ErrorNotice,
  Heading,
  IconButton,
  Loading,
  Row,
  Screen,
} from "../../ui/primitives";
import { BeadButton } from "../../ui/bead-button";
import { DotField } from "../../ui/dot-field";
import { fontSize, lineHeight, metrics, space } from "../../ui/tokens";

import { Illustration } from "../../ui/illustrations";
import { useCopy } from "../../ui/copy";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LegalLinks, type LegalLinkTarget } from "../../ui/brand";
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
  const { colors, uiStyles } = useMobileTheme();
  const security = useSecurity();
  const copy = useCopy();
  const describeError = useSecurityError();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const opened = useRef(false);
  const [document, setDocument] = useState<LegalLinkTarget | null>(null);
  useEffect(() => {
    void security.initialize();
  }, [security.initialize]);
  useEffect(() => {
    if (security.status !== "locked") setDocument(null);
  }, [security.status]);
  // Locked screens consume back; unlocked ones pass it through (listener removed).
  useBackHandler(security.status !== "unlocked", () => {});
  if (security.status === "unlocked") opened.current = true;
  const locked = security.status === "locked";
  const content = (
    <View style={uiStyles.screen}>
      {security.status !== "loading" ? <DotField /> : null}
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingTop: insets.top + space.lg,
          paddingBottom: space.lg,
          paddingLeft: Math.max(insets.left, space.screen),
          paddingRight: Math.max(insets.right, space.screen),
        }}
      >
        <Animated.View
          entering={security.status === "loading" ? undefined : enterItem(0)}
          style={{
            width: "100%",
            maxWidth: metrics.entryWidth,
            alignSelf: "center",
            alignItems: "center",
            gap: space.xl,
          }}
        >
          {security.status === "loading" ? (
            <Loading centered immediate />
          ) : (
            <>
              <Illustration name="lock-hero" size={Math.min(height * 0.36, 340)} />
              <View style={{ alignItems: "center", gap: space.sm }}>
                <Heading style={{ fontSize: fontSize.display, lineHeight: lineHeight.display, textAlign: "center" }}>
                  {security.status === "suspended"
                    ? copy("Çalışma alanın gizlendi", "Your workspace is hidden")
                    : copy("bycoda kilitli", "bycoda is locked")}
                </Heading>
                {security.status === "suspended" ? (
                  <Body muted style={{ textAlign: "center" }}>
                    {copy(
                      "Uygulamaya döndüğünde güvenli erişimin kontrol edilir.",
                      "Secure access will be checked when you return to the app.",
                    )}
                  </Body>
                ) : null}
              </View>
              {locked ? (
                <View style={{ width: "100%", gap: space.lg, alignItems: "center" }}>
                  <ErrorNotice
                    error={security.error}
                    message={describeError(security.error) ?? undefined}
                  />
                  <BeadButton
                    label={
                      security.error === "storage"
                        ? copy("Yeniden dene", "Retry")
                        : copy("Kilidi aç", "Unlock")
                    }
                    busy={security.busy}
                    onPress={() => {
                      if (security.error === "storage") void security.initialize();
                      else void security.unlock(copy("bycoda güvenli giriş", "Unlock bycoda"));
                    }}
                  />
                </View>
              ) : null}
            </>
          )}
        </Animated.View>
      </ScrollView>
      {/* Legal links stay pinned to the bottom edge, outside the centred content. */}
      {locked ? (
        <View style={{ paddingTop: space.sm, paddingBottom: Math.max(insets.bottom, space.md) }}>
          <LegalLinks onOpen={setDocument} />
        </View>
      ) : null}
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
