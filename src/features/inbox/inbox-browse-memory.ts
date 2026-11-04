import type { MobileMachine } from "@/remote/types";
import { isReviewedMachine, reviewedMachine, type ReviewedMachine } from "@/state/reviewed-machine";
import { initialInboxBrowseState, type InboxBrowseState } from "./provider-state";
import type { InboxOrigin } from "./provider-protocol";

type Preferences = Pick<InboxBrowseState, "assigned" | "all" | "search" | "committedSearch" | "limit">;
export type InboxBrowseView = { readonly preferences: Readonly<Preferences>; readonly offset: number };
const preferences = ({ assigned, all, search, committedSearch, limit }: InboxBrowseState): Readonly<Preferences> =>
  Object.freeze({ assigned, all, search, committedSearch, limit });

/** Inbox-local presentation memory. Never retains an item, draft reply or approval. */
export function createInboxBrowseMemory(origin: InboxOrigin | null) {
  let view: InboxBrowseView | undefined = Object.freeze({ preferences: preferences(initialInboxBrowseState), offset: 0 });
  let attention: Readonly<{ offset: number }> | undefined = Object.freeze({ offset: 0 });
  let retired = false;
  const matches = (current: InboxOrigin) => !retired && !!origin && current.machineId === origin.machineId && current.projectId === origin.projectId;
  return {
    /** A distinct read-only position port; no attention records or action state are retained. */
    attention: Object.freeze({
      read(current: InboxOrigin) { return matches(current) ? attention : undefined; },
      scroll(current: InboxOrigin, offset: number) {
        if (matches(current) && Number.isFinite(offset) && offset >= 0)
          attention = Object.freeze({ offset });
      },
    }),
    read(current: InboxOrigin) { return matches(current) ? view : undefined; },
    remember(current: InboxOrigin, state: InboxBrowseState) {
      if (matches(current) && view) view = Object.freeze({ preferences: preferences(state), offset: view.offset });
    },
    scroll(current: InboxOrigin, offset: number) {
      if (matches(current) && view && Number.isFinite(offset) && offset >= 0)
        view = Object.freeze({ ...view, offset });
    },
    retire() { retired = true; view = undefined; attention = undefined; },
  };
}
export type InboxBrowseMemory = ReturnType<typeof createInboxBrowseMemory>;

type Scope = { readonly generation: number; readonly review: ReviewedMachine | undefined; readonly projectId: string | null; readonly memory: InboxBrowseMemory };
/** Synced on every canonical store event, including batched A/B/A transitions. */
export function createInboxBrowseScope() {
  let current: Scope | undefined;
  return {
    sync(machine: MobileMachine | null | undefined, projectId: string | null): Scope {
      const sameMachine = current && (!machine ? !current.review : isReviewedMachine(current.review, { activeId: machine.id, machines: [machine] }));
      if (current && sameMachine && current.projectId === projectId) return current;
      current?.memory.retire();
      current = Object.freeze({ generation: (current?.generation ?? 0) + 1, review: reviewedMachine(machine), projectId,
        memory: createInboxBrowseMemory(machine ? { machineId: machine.id, projectId } : null) });
      return current;
    },
  };
}
