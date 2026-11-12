import type { ComponentType } from "react";
import { Button } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { accountConfig } from "../model/config";
import { useAccount } from "./account-context";

// Evaluated only when Clerk is configured (see AccountProvider).
const ClerkSignIn: ComponentType | null =
  accountConfig.mock || !accountConfig.publishableKey ? null : require("./ClerkSignIn").default;

export function SignInPanel() {
  const copy = useCopy();
  const { mockSignIn } = useAccount();
  if (mockSignIn)
    return <Button label={copy("Demo hesabıyla devam et", "Continue with demo account")} tone="primary" fullWidth onPress={mockSignIn} />;
  return ClerkSignIn ? <ClerkSignIn /> : null;
}
