import {
  commonHostSessionExecutionClient,
  type SessionExecutionPort,
} from "../../../src/shared/lib/host-runtime/session-execution";
import type { SessionRequestOptions } from "../../../src/shared/model/host-contracts/session-execution";
import type { CommandDispatchParams } from "../../../src/shared/model/host-contracts/session-commands";
import type {
  SessionsListParams,
  SessionsPageParams,
  SessionsSyncParams,
} from "../../../src/shared/model/host-contracts/session-reads";
import { RemoteHostError } from "./host-error";
import type { HostRequest, MobileMachine, RemoteRequestOptions } from "./types";

type SessionExecutionMethod =
  | "sessions.list"
  | "sessions.page"
  | "sessions.sync"
  | "commands.dispatch"
  | "commands.status";

export function sessionExecutionMethod(method: string): method is SessionExecutionMethod {
  return (
    method === "sessions.list" ||
    method === "sessions.page" ||
    method === "sessions.sync" ||
    method === "commands.dispatch" ||
    method === "commands.status"
  );
}

/** All mobile facades converge here before the existing authenticated transport.
 * Request-local ports retain options and owner identity across concurrent reads. */
export async function requestSessionExecution<T>(
  machine: Pick<MobileMachine, "id" | "environmentId">,
  request: HostRequest,
  method: SessionExecutionMethod,
  params: Record<string, unknown>,
  options: RemoteRequestOptions,
): Promise<T> {
  const { signal, ...transportOptions } = options;
  let admitted = false;
  const port: SessionExecutionPort = {
    // React Native need not expose structuredClone. Commands are JSON wire DTOs;
    // this matches the existing HTTP/native request serialization exactly.
    snapshotCommand: (command) => JSON.parse(JSON.stringify(command)),
    list: (input) => request("sessions.list", input, options),
    page: (input) => request("sessions.page", input, options),
    sync: (input) => request("sessions.sync", input, options),
    dispatch: (command) => {
      admitted = true;
      // Detach the caller without cancelling an admitted command's receipt wait.
      // Access, ownership, timeout and disposal fences remain in the transport.
      return request("commands.dispatch", command, { ...transportOptions, retry: false });
    },
    // Keep original params so compatibility/schema validation is not weakened.
    status: (commandId) => request("commands.status", { ...params, commandId }, options),
  };
  const client = commonHostSessionExecutionClient(machine.environmentId, port);
  const waitOptions: SessionRequestOptions | undefined = signal
    ? {
        signal: {
          get aborted() {
            return signal.aborted;
          },
          subscribe: (listener) => {
            signal.addEventListener("abort", listener, { once: true });
            return () => signal.removeEventListener("abort", listener);
          },
        },
      }
    : undefined;
  try {
    let result: unknown;
    switch (method) {
      case "sessions.list":
        result = await client.listSessions(params as SessionsListParams, waitOptions);
        break;
      case "sessions.page":
        result = await client.pageSession(params as SessionsPageParams, waitOptions);
        break;
      case "sessions.sync":
        result = await client.syncSession(params as SessionsSyncParams, waitOptions);
        break;
      case "commands.dispatch":
        result = await client.dispatchCommand(params as CommandDispatchParams, waitOptions);
        break;
      case "commands.status":
        result = await client.commandStatus(params.commandId as string, waitOptions);
        break;
    }
    return result as T;
  } catch (error) {
    if (signal?.aborted && error instanceof Error && error.message === "Session request detached")
      throw new RemoteHostError(machine.id, "aborted", "Request cancelled.", admitted);
    throw error;
  }
}
