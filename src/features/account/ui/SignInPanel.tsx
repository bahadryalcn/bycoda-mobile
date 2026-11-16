import type { ComponentType } from "react";
import { Button } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { accountConfig } from "../model/config";
import { useAccount } from "./account-context";

export type SignInStep = "choose" | "code";

// Evaluated only when Clerk is configured (see AccountProvider).
const ClerkSignIn: ComponentType<{ onStepChange?: (step: SignInStep) => void }> | null =
  accountConfig.mock || !accountConfig.publishableKey ? null : require("./ClerkSignIn").default;

/** `onStepChange` reports when the e-mail code step opens, so the caller can give it the room. */
export function SignInPanel({ onStepChange }: { onStepChange?: (step: SignInStep) => void }) {
  const copy = useCopy();
  const { mockSignIn } = useAccount();
  if (mockSignIn)
    return <Button label={copy("Demo hesabıyla devam et", "Continue with demo account")} tone="primary" fullWidth onPress={mockSignIn} />;
  return ClerkSignIn ? <ClerkSignIn onStepChange={onStepChange} /> : null;
}
