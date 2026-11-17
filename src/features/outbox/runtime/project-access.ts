import type { QueryClient } from "@tanstack/react-query";
import type { HostProject, HostProjectDirectory } from "@/domain/types";
import { projectPrivacyKey, projectVisibilityDenied, projectVisibilityExpired } from "../../workspace/project-privacy-cache";

/** Same fresh project-visibility proof as the workspace; cached transcript alone grants nothing. */
export function outboxProjectVisible(cache: QueryClient, machine: { id: string; capabilities?: readonly string[] }, projectId: string): boolean {
  const grouped = machine.capabilities?.includes("projects.directory.v1") === true;
  const key = projectPrivacyKey(machine.id, grouped);
  if (projectVisibilityDenied(cache, key) || projectVisibilityExpired(cache, key)) return false;
  if (grouped) {
    const data = cache.getQueryData<HostProjectDirectory>(key);
    return data?.privacyReady === true && data.projects.some(project => project.id === projectId && project.registered);
  }
  return cache.getQueryData<HostProject[]>(key)?.some(project => project.id === projectId) === true;
}
