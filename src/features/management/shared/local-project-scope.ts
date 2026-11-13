import { useRef, useState } from "react";
import { useMachines } from "@/state/machines";

/** Each screen owns its filter. A computer switch starts from its workspace context. */
export function useLocalProjectScope() {
  const machineId = useMachines(state => state.activeId);
  const globalProjectId = useMachines(state => state.selectedProjectId);
  const [scope, setScope] = useState(() => ({ machineId, projectId: globalProjectId }));
  const projectId = scope.machineId === machineId ? scope.projectId : globalProjectId;
  if (scope.machineId !== machineId) setScope({ machineId, projectId: globalProjectId });
  const current = useRef({ machineId, projectId, revision: 0 });
  if (current.current.machineId !== machineId || current.current.projectId !== projectId) current.current = { machineId, projectId, revision: current.current.revision + 1 };
  const setProjectId = (id: string | null) => { current.current = { machineId, projectId: id, revision: current.current.revision + 1 }; setScope({ machineId, projectId: id }); };
  return { projectId, setProjectId, current, revision: current.current.revision };
}
