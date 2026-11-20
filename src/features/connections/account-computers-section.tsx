import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import Laptop from "lucide-react-native/icons/laptop";
import Network from "lucide-react-native/icons/network";
import Wifi from "lucide-react-native/icons/wifi";
import { IconTile } from "@/ui/icon-tile";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { useMachines } from "@/state/machines";
import { space } from "@/ui/tokens";
import {
  Badge,
  Body,
  ErrorNotice,
  FormActions,
  Heading,
  Loading,
  NavigationGroup,
  NavigationRow,
  Section,
  SectionHeader,
  Sheet,
  Stack,
  StateView,
} from "@/ui/primitives";
import { errorMessage } from "@/ui/error-message";
import type { Computer } from "../account/contracts";
import { isComputerOnline, routeKinds, savedComputerFor, useAccountComputers } from "./account-computers";
import { useAccountPairing } from "./use-account-pairing";

const platformNames: Record<Computer["platform"], string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  ios: "iOS",
  android: "Android",
  web: "Web",
};

/**
 * Signed in: the account's computers with one-tap connect. Signed out: a sign-in row. Hidden when
 * the account or its computers API is unavailable. `others` renders under "Other ways to connect".
 */
export function AccountComputersSection({ others }: { others?: ReactNode }) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const focused = useIsFocused();
  const machines = useMachines((state) => state.machines);
  const { state, refetch } = useAccountComputers();
  const pairing = useAccountPairing();
  useEffect(() => {
    if (focused) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the screen regains focus
  }, [focused]);

  const otherWays = others ? (
    <Stack>
      <SectionHeader title={copy("Bağlanmanın diğer yolları", "Other ways to connect")} />
      {others}
    </Stack>
  ) : null;
  // Most first-run accounts have no computers yet: a loading skeleton that then collapses would shift
  // the connect actions under the owner's finger, so the list appears only once it has rows.
  if (state.kind === "hidden" || state.kind === "loading" || (state.kind === "ready" && !state.computers.length)) return <>{others}</>;
  if (state.kind === "signedOut")
    return (
      <>
        <NavigationGroup>
          <NavigationRow
            label={copy("Bilgisayarlarını otomatik bulmak için giriş yap", "Sign in to find your computers automatically")}
            intent="navigate"
            icon={<IconTile color={colors.muted}><Laptop size={18} strokeWidth={2} color={colors.muted} /></IconTile>}
            onPress={() => router.navigate("/account")}
          />
        </NavigationGroup>
        {others}
      </>
    );

  const { state: flow } = pairing;
  const computer = flow.phase === "idle" ? null : flow.computer;
  const now = Date.now();
  return (
    <>
      <Section title={copy("Bilgisayarların", "Your computers")}>
        {state.kind === "error" ? (
          <StateView
            compact
            tone="danger"
            illustration="error"
            title={copy("Bilgisayarların alınamadı", "Your computers could not be loaded")}
            description={errorMessage(state.error, copy)}
            action={{ label: copy("Yeniden dene", "Retry"), onPress: refetch }}
          />
        ) : null}
        {state.kind === "ready" ? (
          <NavigationGroup>
            {state.computers.map((item) => {
              const online = isComputerOnline(item, now);
              const paired = !!savedComputerFor(item, machines);
              const kinds = routeKinds(item);
              return (
                <NavigationRow
                  key={item.deviceId}
                  label={item.name}
                  detail={`${platformNames[item.platform]} · ${online ? copy("Çevrimiçi", "Online") : copy("Çevrimdışı", "Offline")}`}
                  icon={<IconTile color={colors.muted}><Laptop size={18} strokeWidth={2} color={colors.muted} /></IconTile>}
                  trailing={
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                      {kinds.lan ? <Wifi size={16} strokeWidth={2} color={colors.muted} /> : null}
                      {kinds.tailscale ? <Network size={16} strokeWidth={2} color={colors.muted} /> : null}
                      <Badge
                        label={paired ? copy("Eşlenmiş", "Paired") : copy("Bağlan", "Connect")}
                        tone={paired ? "default" : "active"}
                      />
                    </View>
                  }
                  disabled={flow.phase !== "idle"}
                  onPress={() => void pairing.start(item)}
                />
              );
            })}
          </NavigationGroup>
        ) : null}
      </Section>
      {otherWays}
      {computer ? (
        <Sheet
          visible
          size="compact"
          title={
            flow.phase === "confirm"
              ? copy("Yeni bilgisayara bağlanılsın mı: {p0}?", "Connect to new computer {p0}?", { p0: flow.name })
              : copy("{p0} üzerinde onayla", "Approve on {p0}", { p0: computer.name })
          }
          onClose={pairing.cancel}
          dismissible={flow.phase !== "connecting"}
        >
          <Stack>
            {flow.phase === "error" ? (
              <ErrorNotice error={new Error(flow.message)} message={flow.message} />
            ) : flow.phase === "confirm" ? (
              <>
                <Body>
                  {copy(
                    "Bu bilgisayar bu telefonda henüz kayıtlı değil. Bağlanmadan önce bilgisayarda aynı doğrulama kodunu gördüğünden emin ol.",
                    "This computer is not saved on this phone yet. Before connecting, check that your computer shows the same verification code.",
                  )}
                </Body>
                {flow.sas ? (
                  <Heading accessibilityLabel={flow.sas.split("").join(" ")} style={{ letterSpacing: space.sm, textAlign: "center" }}>
                    {flow.sas}
                  </Heading>
                ) : null}
              </>
            ) : (
              <>
                <Body>
                  {copy(
                    "Bilgisayarda bycoda’yı aç ve bu kodun aynısını gördüğünü doğrulayıp isteği onayla.",
                    "Open bycoda on your computer, check that it shows this same code, then approve the request.",
                  )}
                </Body>
                {flow.phase === "waiting" && flow.sas ? (
                  <Heading accessibilityLabel={flow.sas.split("").join(" ")} style={{ letterSpacing: space.sm, textAlign: "center" }}>
                    {flow.sas}
                  </Heading>
                ) : (
                  <Loading label={flow.phase === "connecting" ? copy("Bağlanıyor…", "Connecting…") : copy("İstek gönderiliyor…", "Sending request…")} />
                )}
              </>
            )}
            {flow.phase === "error" ? (
              <FormActions
                submitLabel={copy("Yeniden dene", "Retry")}
                onSubmit={() => void pairing.start(flow.computer)}
                cancelLabel={copy("Kapat", "Close")}
                onCancel={pairing.cancel}
              />
            ) : flow.phase === "confirm" ? (
              <FormActions
                submitLabel={copy("Bağlan", "Connect")}
                onSubmit={pairing.confirm}
                cancelLabel={copy("Vazgeç", "Cancel")}
                onCancel={pairing.cancel}
              />
            ) : (
              <FormActions
                submitLabel={copy("Vazgeç", "Cancel")}
                onSubmit={pairing.cancel}
                busy={flow.phase === "connecting"}
              />
            )}
          </Stack>
        </Sheet>
      ) : null}
    </>
  );
}
