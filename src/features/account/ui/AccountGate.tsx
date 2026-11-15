import type { PropsWithChildren } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAccount } from "./account-context";
import { AccountScreen } from "./AccountScreen";

/** The mobile workspace is available only after account authentication completes. */
export function AccountGate({ children }: PropsWithChildren) {
  const { status } = useAccount();
  return status === "signedIn" ? children : <SafeAreaView edges={["top"]} style={{ flex: 1 }}><AccountScreen /></SafeAreaView>;
}
