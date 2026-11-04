import { createContext, Fragment, use, useCallback, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { useMachines } from "@/state/machines";
import { createInboxBrowseScope, type InboxBrowseMemory } from "./inbox-browse-memory";

const InboxBrowseMemoryContext = createContext<InboxBrowseMemory | null>(null);
export const useInboxBrowseMemory = () => use(InboxBrowseMemoryContext);

/** Lives above the Inbox mode switch. Inactive content still unmounts and stops reads. */
export function InboxBrowseMemoryProvider({ children }: PropsWithChildren) {
  const [store] = useState(createInboxBrowseScope);
  const snapshot = useCallback(() => {
    const state = useMachines.getState();
    return store.sync(state.machines.find(machine => machine.id === state.activeId), state.selectedProjectId);
  }, [store]);
  const subscribe = useCallback((notify: () => void) => useMachines.subscribe(() => {
    snapshot();
    notify();
  }), [snapshot]);
  const scope = useSyncExternalStore(subscribe, snapshot, snapshot);
  return <InboxBrowseMemoryContext value={scope.memory}><Fragment key={scope.generation}>{children}</Fragment></InboxBrowseMemoryContext>;
}
