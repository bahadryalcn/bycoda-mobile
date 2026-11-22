import { createContext, use, useRef, useState } from "react";
import { useMachines } from "@/state/machines";

/** undefined inherits the workspace selection; null explicitly opens All projects. */
export const InitialProjectFilter = createContext<string | null | undefined>(undefined);

/** Each screen owns its filter. A computer switch starts from its workspace context. */
export function useLocalProjectScope() {
  const machineId = useMachines(state => state.activeId);
  const globalProjectId = useMachines(state => state.selectedProjectId);
  const routeProjectId = use(InitialProjectFilter);
  const initialProjectId = routeProjectId === undefined ? globalProjectId : routeProjectId;
  const [scope, setScope] = useState(() => ({ machineId, routeProjectId, projectId: initialProjectId }));
  const scopeChanged = scope.machineId !== machineId || scope.routeProjectId !== routeProjectId;
  const projectId = scopeChanged ? initialProjectId : scope.projectId;
  if (scopeChanged) setScope({ machineId, routeProjectId, projectId });
  const current = useRef({ machineId, projectId, revision: 0 });
  if (current.current.machineId !== machineId || current.current.projectId !== projectId) current.current = { machineId, projectId, revision: current.current.revision + 1 };
  const setProjectId = (id: string | null) => { current.current = { machineId, projectId: id, revision: current.current.revision + 1 }; setScope({ machineId, routeProjectId, projectId: id }); };
  return { projectId, setProjectId, current, revision: current.current.revision };
}
