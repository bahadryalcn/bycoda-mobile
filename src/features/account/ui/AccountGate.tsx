import type { PropsWithChildren } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAccount } from "./account-context";
import { AccountLoading } from "./AccountLoading";
import { AccountScreen } from "./AccountScreen";

/**
 * The mobile workspace is available only after account authentication completes. The signed-out
 * entry draws full-bleed art and owns its safe areas; the loading state keeps the top inset and
 * is time-bounded with Retry (AccountLoading), never a way around the account or the app lock.
 */
export function AccountGate({ children }: PropsWithChildren) {
  const { status } = useAccount();
  if (status === "signedIn") return children;
  if (status === "loading") return <SafeAreaView edges={["top"]} style={{ flex: 1 }}><AccountLoading /></SafeAreaView>;
  return <AccountScreen />;
}
