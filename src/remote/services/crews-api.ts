import type { HostRequest, RemoteRequestOptions } from "../types";
import type { CrewDefinition, CrewDirectory, CrewRun, CrewRunDetail, SavedCrewAgent } from "../contracts/crews";

/** Project scope is explicit even for host-wide saved definitions/profiles. */
export function createCrewsApi(request: HostRequest) {
  return { crews: {
    list: (projectId: string, options?: RemoteRequestOptions) => request<CrewDirectory>("crews.list", { projectId }, options),
    get: (projectId: string, runId: string, options?: RemoteRequestOptions) => request<CrewRunDetail>("crews.get", { projectId, runId }, options),
    inspect: (projectId: string, definitionId: string, memberId: string, options?: RemoteRequestOptions) => request<unknown>("crews.inspect", { projectId, definitionId, memberId }, options),
    save: (projectId: string, definition: CrewDefinition, expectedUpdatedAt?: number, options?: RemoteRequestOptions) =>
      request<CrewDefinition>("crews.save", { projectId, definition, expectedUpdatedAt }, options),
    delete: (projectId: string, definitionId: string, expectedUpdatedAt: number, options?: RemoteRequestOptions) =>
      request<{ deleted: true }>("crews.delete", { projectId, definitionId, expectedUpdatedAt }, options),
    saveAgent: (projectId: string, agent: Omit<SavedCrewAgent, "updatedAt">, expectedUpdatedAt?: number, options?: RemoteRequestOptions) =>
      request<SavedCrewAgent>("crews.agent.save", { projectId, agent, expectedUpdatedAt }, options),
    deleteAgent: (projectId: string, agentId: string, options?: RemoteRequestOptions) =>
      request<{ deleted: true }>("crews.agent.delete", { projectId, agentId }, options),
    start: (projectId: string, definitionId: string, prompt: string, requestId: string, options?: RemoteRequestOptions) =>
      request<CrewRun>("crews.start", { projectId, definitionId, prompt, requestId }, options),
    control: (projectId: string, runId: string, action: "pause" | "resume" | "stop", options?: RemoteRequestOptions) =>
      request<CrewRun>(`crews.${action}`, { projectId, runId }, options),
  } };
}
