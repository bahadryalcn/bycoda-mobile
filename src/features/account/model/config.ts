export interface AccountConfig {
  /** Clerk publishable key (public by design); empty means sign-in is not configured in this build. */
  publishableKey: string;
  /** From EXPO_PUBLIC_BYCODA_API_URL; empty means accounts are not configured in this build. */
  apiUrl: string;
  /** `EXPO_PUBLIC_ACCOUNT_MOCK=1`: use the in-memory contract server and no Clerk. */
  mock: boolean;
}

type Env = Record<string, string | undefined>;

export function readAccountConfig(env: Env): AccountConfig {
  const apiUrl = (env.EXPO_PUBLIC_BYCODA_API_URL ?? "").trim().replace(/\/+$/, "");
  return {
    publishableKey: (env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "").trim(),
    apiUrl,
    mock: env.EXPO_PUBLIC_ACCOUNT_MOCK === "1",
  };
}

// Expo inlines only literal `process.env.EXPO_PUBLIC_*` reads, so each variable is named here.
export const accountConfig: AccountConfig = readAccountConfig({
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
  EXPO_PUBLIC_BYCODA_API_URL: process.env.EXPO_PUBLIC_BYCODA_API_URL,
  EXPO_PUBLIC_ACCOUNT_MOCK: process.env.EXPO_PUBLIC_ACCOUNT_MOCK,
});

/** Sign-in can run: a Clerk key and API url are present, or the mock server stands in for them. */
export const accountAvailable = (config: AccountConfig) =>
  config.mock || (config.publishableKey !== "" && config.apiUrl !== "");
