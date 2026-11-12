import { createContext, useContext } from "react";
import type { Device } from "../contracts";
import type { AccountRuntime } from "../model/account-runtime";
import type { AccountConfig } from "../model/config";

/** How the sign-in provider (Clerk or the mock) looks to the rest of the app. */
export interface AccountAuth {
  loaded: boolean;
  signedIn: boolean;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

export interface AccountState {
  /** `unavailable`: this build has no sign-in configured. Everything else keeps working. */
  status: "unavailable" | "loading" | "signedOut" | "signedIn";
  config: AccountConfig;
  runtime: AccountRuntime | null;
  /** This phone's device record once registered; null until then. */
  device: Device | null;
  /** Why registration failed (offline, server error); the account screen offers a retry. */
  registerError: Error | null;
  retryRegistration: () => void;
  /** Releases this device on the server (best effort) and signs out locally. */
  signOut: () => Promise<void>;
  /** Mock mode only: pretend to complete a sign-in. */
  mockSignIn?: () => void;
}

export const AccountContext = createContext<AccountState | null>(null);

export function useAccount(): AccountState {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount must be used inside AccountProvider.");
  return value;
}
