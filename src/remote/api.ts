import type {
  HostRequest,
  MachineChanges,
  MachineChangesRequest,
  RemoteRequestOptions,
} from "./types";
import { HostTransport } from "./transport";
import { createWorkspaceApi } from "./services/workspace-api";
import { createSessionsApi } from "./services/sessions-api";
import { createWorkApi } from "./services/work-api";
import { createCrewsApi } from "./services/crews-api";
import { createContentApi } from "./services/content-api";
import { createTerminalApi } from "./services/terminal-api";
export { resolveSessionSync } from "./session-sync";

/** All services share the same machine-bound transport. */
export function createRemoteApi(transport: HostTransport) {
  const request: HostRequest = (method, params = {}, options) =>
    transport.request(method, params, options);
  return {
    transport,
    describe: (options?: RemoteRequestOptions) => transport.describe(options),
    machineChanges: (params: MachineChangesRequest, options?: RemoteRequestOptions) =>
      request<MachineChanges>("machine.changes", { ...params }, options),
    ...createWorkspaceApi(request),
    ...createSessionsApi(transport, request),
    ...createWorkApi(request),
    ...createCrewsApi(request),
    ...createContentApi(request),
    ...createTerminalApi(request),
  };
}
export type RemoteApi = ReturnType<typeof createRemoteApi>;
