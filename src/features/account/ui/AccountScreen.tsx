import { View } from "react-native";
import { Avatar } from "panelui-native/components/avatar";
import { Body, ErrorNotice, Heading, Loading, NavigationGroup, NavigationRow, Screen, SettingIcon, Stack, Skeleton } from "@/ui/primitives";
import LogOut from "lucide-react-native/icons/log-out";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { confirmAction } from "@/ui/confirm";
import { useCopy } from "@/ui/copy";
import { useAsyncAction } from "@/state/actions";
import { graphemes } from "../../../../../src/shared/lib/text/truncate";
import { ActivitySection } from "./ActivitySection";
import { DevicesSection } from "./DevicesSection";
import { ManageAccountSection } from "./ManageAccountSection";
import { AccountWelcome } from "./AccountWelcome";
import { useAccount } from "./account-context";
import { useAccountMe } from "./use-account-me";
import { useGracedReadError } from "./use-graced-read-error";
import { AccountApiError } from "../contracts/errors";

/** Says why this phone could not join the account when the server gave a reason the owner can act on. */
function registrationMessage(error: Error, copy: ReturnType<typeof useCopy>) {
  if (error instanceof AccountApiError && error.code === "conflict" && /device limit/i.test(error.message))
    return copy(
      "Hesabındaki cihaz sınırı dolu. Aşağıdan kullanmadığın bir cihazın oturumunu kapat, sonra yeniden dene.",
      "Your account has reached its device limit. Sign out a device you no longer use below, then retry.",
    );
  if (error instanceof AccountApiError && error.code === "forbidden")
    return copy("Bu hesapta telefon kaydı açık değil.", "Phones are not enabled for this account.");
  return copy("Bu telefon hesaba kaydedilemedi.", "This phone could not be registered to your account.");
}

function Profile() {
  const copy = useCopy();
  const { uiStyles } = useMobileTheme();
  const me = useAccountMe();
  const meError = useGracedReadError(me);
  const user = me.data?.user;
  const name = user?.displayName || user?.email || "";
  return (
    <Stack>
      <ErrorNotice error={meError} onRetry={() => void me.refetch()} message={copy("Profil alınamadı.", "Your profile could not be loaded.")} />
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

/** Mobile account entry, profile, devices, active time and sign out. Notifications live on Settings → Notifications. */
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
        <Loading centered immediate />
      </Screen>
    );
  if (account.status === "signedOut")
    return <AccountWelcome />;
  return (
    <Screen title={title}>
      {account.registerError ? (
        <ErrorNotice error={account.registerError} onRetry={account.retryRegistration} message={registrationMessage(account.registerError, copy)} />
      ) : null}
      <Profile />
      <DevicesSection />
      <ActivitySection />
      <ManageAccountSection />
      <ErrorNotice error={signOut.error} message={copy("Çıkış yapılamadı.", "Could not sign out.")} />
      <NavigationGroup>
        <NavigationRow
          intent="command"
          tone="danger"
          icon={<SettingIcon glyph={LogOut} tone="danger" />}
          label={copy("Çıkış yap", "Sign out")}
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
      </NavigationGroup>
    </Screen>
  );
}
