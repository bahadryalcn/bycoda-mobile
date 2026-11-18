import { useQuery } from "@tanstack/react-query";
import { useAccount } from "./account-context";

/** The signed-in account's own profile (`/v1/me`), shared by every screen that shows the owner. */
export function useAccountMe() {
  const { runtime, device } = useAccount();
  return useQuery({
    queryKey: ["account", "me"],
    queryFn: () => runtime!.client.getMe(),
    enabled: !!runtime && !!device,
  });
}
