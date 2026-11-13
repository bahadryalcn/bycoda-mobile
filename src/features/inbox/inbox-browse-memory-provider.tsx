import { createContext, Fragment, use, useCallback, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { useMachines } from "@/state/machines";
import { useLocalProjectScope } from "../management/shared/local-project-scope";
import { InboxLocalScopeContext } from "./inbox-local-scope";
import { createInboxBrowseScope, type InboxBrowseMemory } from "./inbox-browse-memory";

const InboxBrowseMemoryContext = createContext<InboxBrowseMemory | null>(null);
export const useInboxBrowseMemory = () => use(InboxBrowseMemoryContext);

/** Lives above the Inbox mode switch. Inactive content still unmounts and stops reads. */
export function InboxBrowseMemoryProvider({ children }: PropsWithChildren) {
  const [store] = useState(createInboxBrowseScope);
  const local = useLocalProjectScope();
  const snapshot = useCallback(() => {
    const state = useMachines.getState();
    return store.sync(state.machines.find(machine => machine.id === state.activeId), local.current.current.projectId);
  }, [store, local.current]);
  const subscribe = useCallback((notify: () => void) => useMachines.subscribe(() => {
    snapshot();
    notify();
  }), [snapshot]);
  const scope = useSyncExternalStore(subscribe, snapshot, snapshot);
  return <InboxLocalScopeContext value={{ projectId: local.projectId, setProjectId: local.setProjectId, matches: origin => { const state = useMachines.getState(); return state.activeId === origin.machineId && local.current.current.machineId === origin.machineId && local.current.current.projectId === origin.projectId && local.current.current.revision === local.revision; } }}><InboxBrowseMemoryContext value={scope.memory}><Fragment key={scope.generation}>{children}</Fragment></InboxBrowseMemoryContext></InboxLocalScopeContext>;
}
