import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { useMemo, type PropsWithChildren } from "react";
import { accountConfig } from "../model/config";
import { AccountSession } from "./AccountSession";
import type { AccountAuth } from "./account-context";

function ClerkBridge({ children }: PropsWithChildren) {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth();
  const auth = useMemo<AccountAuth>(
    () => ({
      loaded: isLoaded,
      signedIn: !!isSignedIn,
      getToken: async () => (isSignedIn ? ((await getToken()) ?? null) : null),
      signOut: () => signOut(),
    }),
    [isLoaded, isSignedIn, getToken, signOut],
  );
  return <AccountSession auth={auth}>{children}</AccountSession>;
}

/**
 * Loaded lazily (only when a Clerk key is configured) because the Clerk SDK installs URL and
 * base64 polyfills when it is first evaluated. Session tokens live in the keychain via SecureStore.
 */
export default function ClerkAccount({ children }: PropsWithChildren) {
  return (
    <ClerkProvider
      publishableKey={accountConfig.publishableKey}
      tokenCache={tokenCache}
      __experimental_disableNativeClientSync
    >
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  );
}
