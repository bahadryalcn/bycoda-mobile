import { rewriteSessionReferencePath } from "../src/features/workspace/session-reference";
import { isAccountCallbackPath } from "../src/features/account/model/native-auth-intent";

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  // Ignore warm callbacks so an existing or pending session deep link keeps its full identity.
  // Clerk independently receives the original event and owns nonce/session validation.
  if (isAccountCallbackPath(path)) return initial ? "/" : null;
  return rewriteSessionReferencePath(path);
}
