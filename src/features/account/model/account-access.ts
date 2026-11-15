import { create } from "zustand";

type AccountAccessStatus = "unavailable" | "loading" | "signedOut" | "signedIn";

/** Non-secret authentication fence shared by UI, HTTP and the native Host socket owner. */
export const useAccountAccess = create<{ status: AccountAccessStatus }>(() => ({ status: "loading" }));

export function isAccountAccessAllowed() {
  return useAccountAccess.getState().status === "signedIn";
}
