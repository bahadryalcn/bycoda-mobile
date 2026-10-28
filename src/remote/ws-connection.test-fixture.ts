import { vi } from "vitest";
import type {
  CredentialBinding,
  HostSocketNative,
  NativeSocketEvent,
} from "../../modules/bycoda-host-socket/src/types";
export const binding: CredentialBinding = {
  machineId: "machine-a",
  environmentId: "environment-a",
  endpoint: "wss://host.example/ws",
  credentialGeneration: 1,
  accessEpoch: 1,
};
export function fakeNative(hello: { methods?: string[]; capabilities?: string[] } = {}) {
  const listeners = new Set<(event: NativeSocketEvent) => void>();
  let route = { id: "", generation: 0 };
  const sent: { id: string; method: string; params: Record<string, unknown> }[] = [];
  let response: (request: (typeof sent)[number]) => unknown = () => undefined;
  const native: HostSocketNative = {
    setAccess: vi.fn(async () => undefined),
    acquireCredential: vi.fn(async (b) => ({
      handle: "opaque-handle",
      machineId: b.machineId,
      environmentId: b.environmentId,
      credentialGeneration: b.credentialGeneration,
      accessEpoch: b.accessEpoch,
    })),
    storeCredential: vi.fn(),
    deleteCredential: vi.fn(),
    invalidateCredentials: vi.fn(async () => undefined),
    open: vi.fn(async (_handle, id, generation) => {
      route = { id, generation };
    }),
    send: vi.fn(async (_id, _generation, text) => {
      const request = JSON.parse(text) as (typeof sent)[number];
      sent.push(request);
      const result =
        request.method === "connection.hello"
          ? {
              environmentId: binding.environmentId,
              wireVersion: 2,
              schemaVersion: 1,
              connectionId: "server-a",
              capabilities: [
                "transport.ws.v2",
                "transport.ws.read.v2",
                "transport.ws.sessions.v2",
                "transport.ws.queue.v2",
                "transport.ws.streams.v2",
              ],
              methods: [
                "projects.list",
                "commands.dispatch",
                "commands.status",
                "subscriptions.ack",
                "subscriptions.open",
                "subscriptions.close",
                "requests.cancel",
              ],
              ...hello,
            }
          : request.method === "subscriptions.ack"
            ? { accepted: true }
            : response(request);
      if (result !== undefined)
        queueMicrotask(() => emit({ jsonrpc: "2.0", id: request.id, result }));
    }),
    acknowledge: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    readBulk: vi.fn(),
    addListener: (_event, listener) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  function event(type: NativeSocketEvent["type"], fields: Partial<NativeSocketEvent> = {}) {
    for (const listener of listeners)
      listener({
        connectionId: route.id,
        generation: route.generation,
        environmentId: binding.environmentId,
        type,
        ...fields,
      });
  }
  function emit(value: unknown) {
    event("message", { text: JSON.stringify(value), sequence: sent.length });
  }
  return {
    native,
    sent,
    event,
    emit,
    respond: (next: typeof response) => {
      response = next;
    },
  };
}
