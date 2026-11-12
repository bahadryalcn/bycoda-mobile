import { useCallback, useMemo, useState, type PropsWithChildren } from "react";
import { createMockAccountServer } from "../contracts/mock";
import { AccountSession } from "./AccountSession";
import type { AccountAuth } from "./account-context";

/** `EXPO_PUBLIC_ACCOUNT_MOCK=1`: the in-memory contract server answers every call; no Clerk, no network. */
export default function MockAccount({ children }: PropsWithChildren) {
  const server = useMemo(() => createMockAccountServer(), []);
  const [signedIn, setSignedIn] = useState(false);
  const signIn = useCallback(() => setSignedIn(true), []);
  const auth = useMemo<AccountAuth>(
    () => ({
      loaded: true,
      signedIn,
      getToken: async () => (signedIn ? "mock-token" : null),
      signOut: async () => setSignedIn(false),
    }),
    [signedIn],
  );
  return (
    <AccountSession auth={auth} fetchImpl={server.fetch} mockSignIn={signIn}>
      {children}
    </AccountSession>
  );
}
