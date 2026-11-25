import { useLayoutEffect, useRef, useState } from "react";
import { useMachines } from "@/state/machines";

/**
 * The last specific project selected on each computer in this app run. A page that requires a
 * project falls back to it while the shared selection is All projects.
 */
const lastSpecific = new Map<string, string>();
export function lastSpecificProject(machineId: string | null | undefined) {
  return machineId ? lastSpecific.get(machineId) : undefined;
}
function rememberSpecificProject(machineId: string | null, projectId: string | null) {
  if (machineId && projectId) lastSpecific.set(machineId, projectId);
}

/**
 * The project a required-project page shows while the shared selection is All projects, without
 * asking: the last specific project used on this computer, else the most recently opened one,
 * else the computer's first project. Only projects in the proven directory qualify; `undefined`
 * while the directory is not ready, so a page never reads a project it cannot see.
 */
export function requiredProjectFallback({ projects, last, recent = {} }: {
  projects: readonly { id: string }[] | undefined;
  last?: string;
  recent?: Readonly<Record<string, number>>;
}): string | undefined {
  if (!projects?.length) return undefined;
  if (last && projects.some((project) => project.id === last)) return last;
  let best: { id: string; at: number } | undefined;
  for (const project of projects) {
    const at = recent[project.id] ?? 0;
    if (at > 0 && (!best || at > best.at)) best = { id: project.id, at };
  }
  return best?.id ?? projects[0]!.id;
}

/** A per-scope revision that changes with the computer or the project, for stale-result guards. */
export function useScopeRevision(machineId: string | null, projectId: string | null) {
  const current = useRef({ machineId, projectId, revision: 0 });
  if (current.current.machineId !== machineId || current.current.projectId !== projectId) current.current = { machineId, projectId, revision: current.current.revision + 1 };
  return current;
}

/**
 * The one managed project. Every page reads the shared, persisted selection
 * (`useMachines().selectedProjectId`, per computer; null is All projects) that the header
 * `ProjectScopePill` changes. No page holds a private project: a page opened for one project
 * adopts it into this selection with `useAdoptProjectScope`. Only Tasks, Notes and Automations
 * accept All projects; every other page reads `useRequiredProjectScope`.
 */
export function useLocalProjectScope() {
  const machineId = useMachines(state => state.activeId);
  const projectId = useMachines(state => state.selectedProjectId);
  rememberSpecificProject(machineId, projectId);
  const current = useScopeRevision(machineId, projectId);
  const setProjectId = (id: string | null) => {
    const machines = useMachines.getState();
    if (machines.activeId !== machineId) return;
    machines.selectProject(id);
    // The store refuses a write while storage is unavailable; the scope then stays unchanged.
    if (useMachines.getState().selectedProjectId !== id) return;
    rememberSpecificProject(machineId, id);
    current.current = { machineId, projectId: id, revision: current.current.revision + 1 };
  };
  return { projectId, setProjectId, current, revision: current.current.revision };
}

/**
 * A route, link or notification opened for one project makes it the shared selection, so the
 * page never shows a different project than the header pill. `undefined` adopts nothing; `null`
 * adopts All projects. The project belongs to `machineId` (or the computer active when the page
 * opened) and is never applied to another computer. With `withinAll`, an All projects selection
 * already contains the page (a session), so only a different selected project is replaced.
 */
export function useAdoptProjectScope(projectId: string | null | undefined, machineId?: string, { withinAll = false } = {}) {
  const activeId = useMachines(state => state.activeId);
  const hydrated = useMachines(state => state.hydrated);
  const [origin] = useState(() => machineId ?? activeId);
  const owner = machineId ?? origin;
  // Effect reason: writing the persisted store is a side effect of opening the route; layout
  // timing applies it before the first paint shows the previous project.
  useLayoutEffect(() => {
    if (projectId === undefined || !hydrated || !activeId || activeId !== owner) return;
    const state = useMachines.getState();
    if (withinAll && state.selectedProjectId === null) return;
    if (state.selectedProjectId !== projectId) state.selectProject(projectId);
  }, [projectId, owner, activeId, hydrated, withinAll]);
}
