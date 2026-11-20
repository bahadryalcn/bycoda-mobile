import type { HostTransport } from "../remote/transport";
import type { MobileMachine } from "../remote/types";

/**
 * One HostTransport per exact (computer, route, credential scope, access scope), shared by every
 * mounted consumer. Each transport owns a runtime lease, a `prepare()` and its streams, and the
 * project stream hub is keyed by transport, so per-hook transports opened one Host stream per
 * consumer and exhausted the 64-subscription socket budget.
 */
type Entry = { client: HostTransport; refs: number };
const entries = new Map<string, Entry>();
const identities = new WeakMap<object, number>();
let nextIdentity = 0;
const identityOf = (value: object | null | undefined) => {
  if (!value) return 0;
  let id = identities.get(value);
  if (id === undefined) identities.set(value, (id = ++nextIdentity));
  return id;
};

/**
 * Everything that makes two consumers interchangeable. The private-content access object is part of
 * the key, so a consumer is never served by a transport that checks a different visibility scope;
 * any change of route, identity, capabilities, consent or socket runtime selects another transport.
 */
export function hostClientKey(
  machine: MobileMachine,
  consentScope: string,
  access: object,
  socketProvider: object | null | undefined,
): string {
  return JSON.stringify([
    machine.id,
    machine.endpoint,
    machine.lanKey ?? null,
    machine.environmentId,
    machine.capabilities ?? [],
    consentScope,
    identityOf(access),
    identityOf(socketProvider),
  ]);
}

/**
 * The shared transport for a key, created on first use. Safe to call while rendering: an unused
 * transport holds no lease, stream or timer until it is retained.
 */
export function sharedHostClient(key: string, create: () => HostTransport): HostTransport {
  const current = entries.get(key);
  // A transport that lost its removed-target scope fails closed for good; later renders get a fresh one.
  if (current && !current.client.hasLostTargetScope?.()) return current.client;
  const entry: Entry = { client: create(), refs: 0 };
  entries.set(key, entry);
  return entry.client;
}

/**
 * Count one consumer on the transport and warm its lease. Releasing the last consumer disposes the
 * transport (closing its streams, aborting its requests and releasing its lease) once the current
 * task ends, so a screen replaced in the same commit hands the transport over instead of closing it.
 */
export function retainHostClient(key: string, client: HostTransport): () => void {
  let entry = entries.get(key);
  if (entry?.client !== client) {
    // Replaced after this consumer rendered: it keeps its own private transport.
    entry = { client, refs: 0 };
    if (!entries.has(key)) entries.set(key, entry);
  }
  const owned = entry;
  owned.refs++;
  void client.prepare?.().catch(() => undefined);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--owned.refs) return;
    queueMicrotask(() => {
      if (owned.refs) return;
      if (entries.get(key) === owned) entries.delete(key);
      client.dispose?.();
    });
  };
}
