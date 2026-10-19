import { useMobileTheme } from "@/ui/theme";
import { useEffect, useState, type PropsWithChildren } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import Laptop from "lucide-react-native/icons/laptop";
import { usePathname } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ShieldCheck from "lucide-react-native/icons/shield-check";
import { useActiveMachine, useMachines } from "../../state/machines";
import { assertAppAccess } from "../../state/security";
import { useAsyncAction } from "../../state/actions";
import {
  Body,
  Button,
  Card,
  ErrorText,
  Disclosure,
  Heading,
  Loading,
  Row,
  Screen,
  Sheet,
} from "../../ui/primitives";
import { IconTile } from "../../ui/icon-tile";
import { enterItem } from "../../ui/motion";
import { colors, space } from "../../ui/tokens";
import { useCopy } from "../../ui/copy";
import { LegalDocument, legalDocumentTitle, type LegalDocumentId } from "../legal/legal-document";
import { consentScope, createConsentStore } from "./consent-store";
import { useProviderPermission } from "./consent-access";
import { ScreenOverlay } from "../../ui/overlays";

const store = createConsentStore(AsyncStorage);
const useConsentRevision = create<{ revision: number }>(() => ({
  revision: 0,
}));

export async function revokeProviderConsent() {
  await store.revoke();
  useProviderPermission.setState({ scopes: {} });
  useConsentRevision.setState((state) => ({ revision: state.revision + 1 }));
}

/** Keep navigation mounted; request-time guards protect the workspace beneath this overlay. */
export function ProviderConsentGate({ children }: PropsWithChildren) {
  useMobileTheme();
  const copy = useCopy();
  const pathname = usePathname();
  const machine = useActiveMachine();
  const scope = machine ? consentScope(machine.environmentId, machine.providers ?? []) : null;
  const revision = useConsentRevision((state) => state.revision);
  const [permission, setPermission] = useState<{
    scope: string | null;
    revision: number;
    allowed: boolean;
    error: boolean;
  } | null>(null);
  const [document, setDocument] = useState<LegalDocumentId | null>(null);
  const action = useAsyncAction();
  const cache = useQueryClient();
  const insets = useSafeAreaInsets();
  const loaded = permission?.scope === scope && permission.revision === revision;
  const localInformation = pathname === "/report" || pathname.startsWith("/legal/");
  const visible = !localInformation && scope !== null && !(loaded && permission.allowed);

  useEffect(() => {
    if (visible) void cache.cancelQueries({ queryKey: ["machine"] });
  }, [visible, scope, cache]);

  useEffect(() => {
    let current = true;
    if (scope === null) return;
    void store.allows(scope).then(
      (allowed) => {
        if (!current) return;
        useProviderPermission.setState((state) => ({
          scopes: { ...state.scopes, [scope]: allowed },
        }));
        setPermission({ scope, revision, allowed, error: false });
      },
      () => {
        if (!current) return;
        useProviderPermission.setState((state) => ({
          scopes: { ...state.scopes, [scope]: false },
        }));
        setPermission({ scope, revision, allowed: false, error: true });
      },
    );
    return () => {
      current = false;
    };
  }, [scope, revision]);

  async function allow() {
    if (!scope) return;
    await action.run(async () => {
      assertAppAccess();
      await store.allow(scope);
      assertAppAccess();
      useProviderPermission.setState((state) => ({
        scopes: { ...state.scopes, [scope]: true },
      }));
      setPermission({ scope, revision, allowed: true, error: false });
    });
  }
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        accessibilityElementsHidden={visible}
        importantForAccessibility={visible ? "no-hide-descendants" : "auto"}
      >
        {children}
      </View>
      <ScreenOverlay visible={visible} priority={100} onClose={() => {}}>
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background,
            paddingTop: insets.top,
          }}
        >
          <Screen title={loaded ? copy("Verilerin nereye gider?", "Where does your data go?") : undefined}>
            {!loaded ? (
              <Loading
                label={copy("Gizlilik tercihi yükleniyor…", "Loading privacy preference…")}
              />
            ) : (
              <>
                <Animated.View entering={enterItem(0)}>
                  <Card>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                      <IconTile color={colors.accent}>
                        <Laptop size={18} strokeWidth={2} color={colors.accent} />
                      </IconTile>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Body>{machine?.name ?? copy("Bilgisayar", "Computer")}</Body>
                        <Body muted numberOfLines={1}>{machine?.endpoint}</Body>
                      </View>
                    </View>
                  </Card>
                </Animated.View>
                <Animated.View entering={enterItem(1)}>
                  <Card>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                      <IconTile color={colors.success}>
                        <ShieldCheck size={18} strokeWidth={2} color={colors.success} />
                      </IconTile>
                      <Heading style={{ flex: 1 }}>
                        {copy("Gönderilenler", "What is sent")}
                      </Heading>
                    </View>
                    <Body>
                      {copy(
                        "Gönderdiğin mesajlar, seçtiğin dosyalar, kod, ekler ve işlem sonuçları bu bilgisayara iletilir. Bir AI oturumu başlattığında veya ona mesaj gönderdiğinde bilgisayarda seçilen sağlayıcı bu içeriği işleyebilir.",
                        "Messages, selected files, code, attachments and operation results are sent to this computer. When you start or message an AI session, the provider selected on that computer may process this content.",
                      )}
                    </Body>
                  </Card>
                </Animated.View>
                <Animated.View entering={enterItem(2)}>
                  <Card>
                    <Heading>{copy("Sağlayıcılar", "Providers")}</Heading>
                    <Body muted>
                      {machine?.providers?.join(", ") ||
                        copy("Bilgisayarın ayarlarından belirlenir.", "Set in your computer’s settings.")}
                    </Body>
                    <Disclosure label={copy("Veri kullanımı", "Data use")}>
                      <Body muted>
                        {copy(
                          "Sağlayıcının saklama ve eğitim kuralları kendi hesabına ve ayarlarına bağlıdır. bycoda geliştiricisi çalışma alanını almaz veya izlemez. Hassas bilgileri yalnız paylaşmaya yetkiliysen gönder.",
                          "Provider retention and training depend on your account and settings. The bycoda developer does not receive or monitor your workspace. Only share sensitive information you are authorized to send.",
                        )}
                      </Body>
                    </Disclosure>
                  </Card>
                </Animated.View>
                <ErrorText
                  error={permission.error || action.error}
                  message={copy(
                    "Gizlilik tercihi okunamadı veya kaydedilemedi. Yeniden dene.",
                    "Your privacy preference could not be read or saved. Try again.",
                  )}
                />
                {permission.error ? (
                  <Button
                    label={copy("Yeniden yükle", "Reload")}
                    tone="secondary"
                    fullWidth
                    onPress={() =>
                      useConsentRevision.setState((state) => ({
                        revision: state.revision + 1,
                      }))
                    }
                  />
                ) : null}
                <View style={{ gap: space.sm }}>
                  <Button
                    label={copy(
                      "Veri paylaşımına izin ver ve devam et",
                      "Allow data sharing and continue",
                    )}
                    tone="primary"
                    fullWidth
                    busy={action.isPending}
                    disabled={permission.error}
                    onPress={() => {
                      void allow();
                    }}
                  />
                  <Row style={{ justifyContent: "center" }}>
                    <Button
                      tone="secondary"
                      label={copy("Gizlilik politikası", "Privacy policy")}
                      onPress={() => setDocument("privacy")}
                    />
                    <Button
                      tone="secondary"
                      label={copy("Kullanım koşulları", "Terms of use")}
                      onPress={() => setDocument("terms")}
                    />
                  </Row>
                  <Button
                    tone="quiet"
                    label={copy("İzin vermeden bağlantıyı kaldır", "Disconnect without allowing")}
                    disabled={action.isPending}
                    onPress={() => {
                      if (!machine) return;
                      void action.run(async () => {
                        assertAppAccess();
                        await useMachines.getState().removeMachine(machine.id);
                      });
                    }}
                    style={{ alignSelf: "center" }}
                  />
                </View>
                <Body muted style={{ textAlign: "center" }}>
                  {copy(
                    "İznini Ayarlar → Gizlilik ve veriler bölümünden geri çekebilirsin. Bilgisayarında zaten çalışan işler bağımsız olarak devam eder.",
                    "Withdraw permission in Settings → Privacy & data. Work already running on your computer continues independently.",
                  )}
                </Body>
              </>
            )}
          </Screen>
          <Sheet
            visible={document !== null}
            size="full"
            title={document ? legalDocumentTitle(document, copy) : ""}
            onClose={() => setDocument(null)}
          >
            {document ? <LegalDocument document={document} /> : null}
          </Sheet>
        </View>
      </ScreenOverlay>
    </View>
  );
}
