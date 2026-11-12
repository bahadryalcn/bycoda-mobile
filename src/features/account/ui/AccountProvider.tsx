import { useMemo, type ComponentType, type PropsWithChildren } from "react";
import { accountAvailable, accountConfig } from "../model/config";
import { AccountContext, type AccountState } from "./account-context";

// A synchronous require, evaluated only when sign-in is configured: the Clerk SDK installs URL and
// base64 polyfills on first evaluation, and a lazy component would remount the whole app tree.
const Provider: ComponentType<PropsWithChildren> | null =
  process.env.EXPO_OS === "web" || !accountAvailable(accountConfig)
    ? null
    : accountConfig.mock
      ? require("./MockAccount").default
      : require("./ClerkAccount").default;

/**
 * Optional sign-in around the app. Without a configured key (or mock flag) it is inert: pairing and
 * every Host feature work exactly as before, signed out.
 */
export function AccountProvider({ children }: PropsWithChildren) {
  const inert = useMemo<AccountState>(
    () => ({
      status: "unavailable",
      config: accountConfig,
      runtime: null,
      device: null,
      registerError: null,
      retryRegistration: () => undefined,
      signOut: async () => undefined,
    }),
    [],
  );
  if (!Provider) return <AccountContext value={inert}>{children}</AccountContext>;
  return <Provider>{children}</Provider>;
}
