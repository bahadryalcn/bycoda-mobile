import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { Avatar } from "panelui-native/components/avatar";
import { Body, Button, ErrorNotice, Heading, Loading, Screen, Section, Stack, StateView, Skeleton } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { confirmAction } from "@/ui/confirm";
import { useCopy } from "@/ui/copy";
import { useAsyncAction } from "@/state/actions";
import { graphemes } from "../../../../../src/shared/lib/text/truncate";
import { ActivitySection } from "./ActivitySection";
import { DevicesSection } from "./DevicesSection";
import { ManageAccountSection } from "./ManageAccountSection";
import { PushSection } from "./PushSection";
import { AccountWelcome } from "./AccountWelcome";
import { useAccount } from "./account-context";

function Profile() {
  const copy = useCopy();
  const { uiStyles } = useMobileTheme();
  const { runtime, device } = useAccount();
  const me = useQuery({
    queryKey: ["account", "me"],
    queryFn: () => runtime!.client.getMe(),
    enabled: !!runtime && !!device,
  });
  const user = me.data?.user;
  const name = user?.displayName || user?.email || "";
  return (
    <Stack>
      <ErrorNotice error={me.error} onRetry={() => void me.refetch()} message={copy("Profil alınamadı.", "Your profile could not be loaded.")} />
      {user ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <Avatar
            size="lg"
            source={user.avatarUrl ? { uri: user.avatarUrl } : undefined}
            fallback={(graphemes(name.trim())[0] ?? "?").toUpperCase()}
          />
          <View style={{ flex: 1, gap: space.xxs }}>
            <Heading style={uiStyles.title}>{name}</Heading>
            {user.displayName ? <Body muted>{user.email}</Body> : null}
          </View>
        </View>
      ) : me.isPending ? (
        <Skeleton variant="content" rows={2} />
      ) : null}
    </Stack>
  );
}

/** Mobile account entry, profile, devices, active time, notifications and sign out. */
export function AccountScreen() {
  const copy = useCopy();
  const account = useAccount();
  const signOut = useAsyncAction<void>();
  const title = copy("Hesap", "Account");

  if (account.status === "unavailable")
    return <AccountWelcome unavailable />;
  if (account.status === "loading")
    return (
      <Screen title={title}>
        <Loading centered label={copy("Yükleniyor…", "Loading…")} />
      </Screen>
    );
  if (account.status === "signedOut")
    return <AccountWelcome />;
  return (
    <Screen title={title}>
      <Stack>
        {account.registerError ? (
          <ErrorNotice error={account.registerError} onRetry={account.retryRegistration} message={copy("Bu telefon hesaba kaydedilemedi.", "This phone could not be registered to your account.")} />
        ) : null}
        <Profile />
        <DevicesSection />
        <ActivitySection />
        <PushSection />
        <ManageAccountSection />
        <ErrorNotice error={signOut.error} message={copy("Çıkış yapılamadı.", "Could not sign out.")} />
        <Button
          label={copy("Çıkış yap", "Sign out")}
          tone="danger"
          busy={signOut.isPending}
          disabled={signOut.isPending}
          onPress={() =>
            confirmAction(
              copy("Çıkış yapılsın mı?", "Sign out?"),
              copy("Bu telefon hesaptan çıkarılır. Yerel veriler ve bilgisayar eşlemeleri korunur.", "This phone is removed from your account. Local data and computer pairings are kept."),
              copy("Çıkış yap", "Sign out"),
              () => {
                void signOut.run(() => account.signOut());
              },
              copy("Vazgeç", "Cancel"),
            )
          }
        />
      </Stack>
    </Screen>
  );
}
