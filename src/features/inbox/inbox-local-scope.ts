import { createContext, use } from "react";
import { useMachines } from "@/state/machines";
import type { InboxOrigin } from "./provider-protocol";

export type InboxLocalScope = { projectId: string | null; setProjectId: (projectId: string | null) => void; matches: (origin: InboxOrigin) => boolean };
export const InboxLocalScopeContext = createContext<InboxLocalScope | null>(null);
/** Standalone consumers retain their existing workspace identity contract. */
export function useInboxLocalScope() {
  const scope = use(InboxLocalScopeContext);
  return scope ?? {
    projectId: useMachines.getState().selectedProjectId,
    setProjectId: (id: string | null) => useMachines.getState().selectProject(id),
    matches: (origin: InboxOrigin) => {
      const state = useMachines.getState();
      return state.activeId === origin.machineId && state.selectedProjectId === origin.projectId;
    },
  };
}
