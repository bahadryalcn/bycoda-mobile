import type { HostRequest, RemoteRequestOptions } from "../types";
import type {
  HostTerminal, HostTerminalCreate, HostTerminalList, HostTerminalRead,
} from "../../../../src/features/host-tools/terminalTypes";

/** All terminal operations retain the paired machine's transport and permission checks. */
export function createTerminalApi(request: HostRequest) {
  return {
    terminalList: (projectId: string, options?: RemoteRequestOptions) =>
      request<HostTerminalList>("terminals.list", { projectId }, options),
    terminalRead: (projectId: string, id: string, after: number, options?: RemoteRequestOptions) =>
      request<HostTerminalRead>("terminals.read", { projectId, id, after, limit: 16_384 }, options),
    terminalCreate: (params: HostTerminalCreate) =>
      request<HostTerminal>("terminals.create", { ...params }, { retry: false }),
    /** Raw keystrokes for the PTY, never retried: a repeated key would type twice. */
    terminalWrite: (projectId: string, id: string, data: string) =>
      request<{ accepted: true }>("terminals.write", { projectId, id, data }, { retry: false }),
    terminalResize: (projectId: string, id: string, cols: number, rows: number) =>
      request<{ accepted: true }>("terminals.resize", { projectId, id, cols, rows }, { retry: false }),
    /** Ctrl-C to the PTY's foreground program; the shell keeps running. */
    terminalInterrupt: (projectId: string, id: string) =>
      request<{ accepted: true }>("terminals.interrupt", { projectId, id }, { retry: false }),
    terminalClose: (projectId: string, id: string) =>
      request<{ closed: true }>("terminals.close", { projectId, id }, { retry: false }),
  };
}
