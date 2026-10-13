import type {
  RemoteInboxItem,
  RemoteInboxPrAction,
} from "../../../../src/features/inbox/model/remoteInbox";
/** Provider remains authoritative; show only actions relevant to the known PR state. */
export function providerPrActions(
  item: Pick<RemoteInboxItem, "provider" | "kind" | "state" | "draft">,
): RemoteInboxPrAction[] {
  if (item.provider !== "github" || item.kind !== "pr") return [];
  const state = item.state.toLowerCase();
  if (state === "closed") return ["reopen"];
  if (state !== "open") return [];
  return item.draft ? ["ready", "close"] : ["draft", "close", "merge", "squash", "rebase"];
}
