import { useQuery } from "@tanstack/react-query";
import { useAccount } from "./account-context";

/** The signed-in account's own profile (`/v1/me`), shared by every screen that shows the owner. */
export function useAccountMe() {
  const { runtime, status } = useAccount();
  return useQuery({
    queryKey: ["account", "me"],
    queryFn: () => runtime!.client.getMe(),
    // A user-scoped read: it must not wait for this phone's device registration, which can fail on its own.
    enabled: !!runtime && status === "signedIn",
  });
}
