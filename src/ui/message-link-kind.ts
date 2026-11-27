import { markdownTarget } from "./message-inline";
import { isLoopbackWebUrl } from "./loopback-link";
import { messageSessionLink } from "./message-session-link";

/**
 * What an inline prose link opens, for its small leading icon: another conversation in the app, a
 * page on the computer's local server, or a web page. File references are chips with their own
 * icon, and a target nothing can open stays plain text, so neither gets one. Shared by the
 * renderer and the selection layer, which reserves the icon's one-em slot.
 */
export type LinkIconKind = "session" | "local" | "web";

export function linkIconKind(href: string): LinkIconKind | null {
  if (messageSessionLink(href)) return "session";
  const target = markdownTarget(href);
  if (target.kind !== "web") return null;
  return isLoopbackWebUrl(target.href) ? "local" : "web";
}
