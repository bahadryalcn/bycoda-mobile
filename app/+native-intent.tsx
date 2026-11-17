import { rewriteSessionReferencePath } from "../src/features/workspace/session-reference";
import { isAccountCallbackPath } from "../src/features/account/model/native-auth-intent";

let promptLinks = 0;

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  // Ignore warm callbacks so an existing or pending session deep link keeps its full identity.
  // Clerk independently receives the original event and owns nonce/session validation.
  if (isAccountCallbackPath(path)) return initial ? "/" : null;
  // iOS share extension hands over through `<scheme>://dataUrl=<key>`; expo-share-intent reads
  // that URL itself, so the router only needs to stay where it is (or land on home when cold).
  if (path.includes("dataUrl=")) return initial ? "/" : null;
  const target = rewriteSessionReferencePath(path);
  // A distinct `n` makes a repeated identical prompt link a new request for a warm screen.
  return target.startsWith("/sessions?new=1&prompt=")
    ? `${target}&n=link${Date.now().toString(36)}${promptLinks++}`
    : target;
}
