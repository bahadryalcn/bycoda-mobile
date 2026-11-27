import { useEffect, type ReactNode } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import Laptop from "lucide-react-native/icons/laptop";
import { useCopy } from "@/ui/copy";
import { useMachines } from "@/state/machines";
import { space } from "@/ui/tokens";
import {
  Body,
  Button,
  ErrorNotice,
  FormActions,
  Heading,
  Loading,
  NavigationGroup,
  NavigationRow,
  RowIcon,
  Section,
  SectionHeader,
  Sheet,
  Stack,
  StateView,
  StatusText,
} from "@/ui/primitives";
import { errorMessage } from "@/ui/error-message";
import { accountReadMessage } from "../account/ui/account-error-copy";
import { routeLabel } from "@/state/route-kind";
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
  const focused = useIsFocused();
  const machines = useMachines((state) => state.machines);
  const { state, refetch } = useAccountComputers();
  const pairing = useAccountPairing();
  useEffect(() => {
    if (focused) refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the screen regains focus
  }, [focused]);

  const otherWays = others ? (
    <View style={{ gap: space.sm }}>
      <SectionHeader title={copy("Bağlanmanın diğer yolları", "Other ways to connect")} />
      {others}
    </View>
  ) : null;
  // Most first-run accounts have no computers yet: a loading skeleton that then collapses would shift
  // the connect actions under the owner's finger, so the list appears only once it has rows.
  // A computer already saved on this phone is listed (and selected) under "On this phone"; the account
  // section offers only the ones not paired yet, so no computer appears twice with different words.
  const unpaired = state.kind === "ready" ? state.computers.filter((item) => !savedComputerFor(item, machines)) : [];
  if (state.kind === "hidden" || state.kind === "loading" || (state.kind === "ready" && !unpaired.length)) return <>{others}</>;
  if (state.kind === "signedOut")
    return (
      <>
        <NavigationGroup>
          <NavigationRow
            label={copy("Bilgisayarlarını otomatik bulmak için giriş yap", "Sign in to find your computers automatically")}
            intent="navigate"
            icon={<RowIcon glyph={Laptop} />}
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
      <Section title={machines.length
        ? copy("Hesabındaki diğer bilgisayarlar", "Other computers in your account")
        : copy("Bilgisayarların", "Your computers")}>
        {state.kind === "error" ? (
          <StateView
            compact
            tone="danger"
            illustration="error"
            title={copy("Bilgisayarların alınamadı", "Your computers could not be loaded")}
            description={accountReadMessage(state.error, copy, errorMessage(state.error, copy, undefined, { read: true }))}
            action={{ label: copy("Yeniden dene", "Retry"), onPress: refetch }}
          />
        ) : null}
        {state.kind === "ready" ? (
          <NavigationGroup>
            {unpaired.map((item) => {
              const online = isComputerOnline(item, now);
              const kinds = routeKinds(item);
              return (
                <NavigationRow
                  key={item.deviceId}
                  label={item.name}
                  detail={[
                    platformNames[item.platform],
                    online ? copy("Bilgisayar çevrimiçi", "Computer online") : copy("Bilgisayar çevrimdışı", "Computer offline"),
                    // Route types are named once, here; a public route says so, since anyone on the internet can reach it.
                    ...(["lan", "tailscale", "public"] as const).filter((kind) => kinds[kind]).map((kind) => routeLabel(kind, copy)),
                  ].join(" · ")}
                  detailLines={0}
                  icon={<RowIcon glyph={Laptop} />}
                  trailing={<StatusText label={copy("Bağlan", "Connect")} tone="active" dot={false} />}
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
            ) : flow.phase === "waiting" ? (
              // Waiting has nothing to submit: progress is the body, cancelling is quiet. Connecting cannot be cancelled.
              <Button tone="quiet" label={copy("Vazgeç", "Cancel")} onPress={pairing.cancel} />
            ) : null}
          </Stack>
        </Sheet>
      ) : null}
    </>
  );
}
