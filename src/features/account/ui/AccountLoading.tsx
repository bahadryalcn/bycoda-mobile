import { View } from "react-native";
import { Loading, Screen, StateView } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useAccountLoadDeadline } from "./use-account-load-deadline";

/**
 * Account gate loading state. The wait is bounded: after the deadline the screen says the account
 * service is slow and offers Retry. It never opens the workspace; the app opens by itself as soon as
 * the sign-in provider reports a verified session, so identity and the app lock stay in force.
 */
export function AccountLoading() {
  const copy = useCopy();
  const { stalled, retry } = useAccountLoadDeadline();
  const title = copy("Hesap", "Account");
  return (
    <Screen title={title}>
      {stalled ? (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <StateView
            tone="warning"
            title={copy("Hesap bağlantısı yavaş", "The account connection is slow")}
            description={copy(
              "İnternet bağlantını kontrol et. Hesap doğrulanınca uygulama kendiliğinden açılır.",
              "Check your internet connection. The app opens by itself once your account is verified.",
            )}
            action={{ label: copy("Tekrar dene", "Retry"), onPress: retry }}
          />
        </View>
      ) : (
        <Loading centered immediate />
      )}
    </Screen>
  );
}
