import { rewriteSessionReferencePath } from "../src/features/workspace/session-reference";
import { isAccountCallbackPath } from "../src/features/account/model/native-auth-intent";

let promptLinks = 0;
const shareCallbackAddresses = new Set([
  "bycoda://dataUrl=bycodaShareKey",
  "bycoda:///dataUrl=bycodaShareKey",
  "/dataUrl=bycodaShareKey",
  "dataUrl=bycodaShareKey",
]);

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  // Ignore warm callbacks so an existing or pending session deep link keeps its full identity.
  // Clerk independently receives the original event and owns nonce/session validation.
  if (isAccountCallbackPath(path)) return initial ? "/" : null;
  // The share receiver consumes the extension callback. Match its address only;
  // prompt text and other routes may contain dataUrl in their query.
  if (shareCallbackAddresses.has(path.split(/[?#]/, 1)[0])) return initial ? "/" : null;
  const target = rewriteSessionReferencePath(path);
  // A distinct `n` makes a repeated identical prompt link a new request for a warm screen.
  return target.startsWith("/sessions?new=1&prompt=")
    ? `${target}&n=link${Date.now().toString(36)}${promptLinks++}`
    : target;
}
