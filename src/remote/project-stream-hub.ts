import type { HostSessionSummary } from "./types";
import type { HostTransport } from "./transport";
import type { MobileStreamSubscription } from "./host-transport";
import { watchProjectStream } from "./session-sync";
import { backoffDelayMs } from "./backoff";
import { replaceEqualDeep } from "@tanstack/react-query";

export type ProjectStreamValue = { etag: string; sessions: HostSessionSummary[] };
export type ProjectStreamListener = {
  apply(value: ProjectStreamValue, assertCurrent: () => void): Promise<void>;
  onError(error: Error): void;
};
type Entry = {
  listeners: Set<ProjectStreamListener>;
  subscription?: MobileStreamSubscription;
  /** Structurally shared with the previous snapshot: unchanged session rows keep their identity. */
  last?: ProjectStreamValue;
  /** Consumers that applied `last` successfully; an identical snapshot skips them. */
  delivered: WeakSet<ProjectStreamListener>;
  released: boolean;
  attempt: number;
  timer?: ReturnType<typeof setTimeout>;
};

// One Host stream per (transport, project), shared by every consumer. Per-consumer
// streams exhausted the 64-stream socket budget after about 21 projects.
const hubs = new WeakMap<HostTransport, Map<string, Entry>>();
const FATAL_KINDS = ["auth", "identity", "unsupported"];

/** Retain the shared project stream; call the returned function to release it. */
export function retainProjectStream(
  client: HostTransport,
  projectId: string,
  listener: ProjectStreamListener,
): () => void {
  let entries = hubs.get(client);
  if (!entries) hubs.set(client, (entries = new Map()));
  let entry = entries.get(projectId);
  if (!entry) {
    entry = { listeners: new Set(), delivered: new WeakSet(), released: false, attempt: 0 };
    entries.set(projectId, entry);
    open(client, projectId, entry);
  }
  const owned = entry;
  owned.listeners.add(listener);
  // A late consumer has missed the snapshot already delivered to earlier ones.
  if (owned.last) {
    const value = owned.last;
    queueMicrotask(() => {
      if (owned.released || !owned.listeners.has(listener) || owned.last !== value) return;
      const current = () => {
        client.assertCurrentAccess();
        if (owned.released || !owned.listeners.has(listener) || owned.last !== value)
          throw new Error("The project stream is no longer current.");
      };
      listener.apply(value, current).then(
        () => {
          if (owned.last === value) owned.delivered.add(listener);
        },
        (error) => listener.onError(asError(error)),
      );
    });
  }
  return () => {
    owned.listeners.delete(listener);
    if (owned.listeners.size) return;
    owned.released = true;
    clearTimeout(owned.timer);
    owned.subscription?.close();
    if (entries!.get(projectId) === owned) entries!.delete(projectId);
  };
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error("The project stream failed.");
}
function broadcast(entry: Entry, error: Error) {
  // Every consumer is now in an error state; the next snapshot must reach all of them, even if equal.
  entry.delivered = new WeakSet();
  for (const listener of [...entry.listeners]) {
    try {
      listener.onError(error);
    } catch {
      /* A consumer's error handler cannot affect its siblings. */
    }
  }
}
function retire(client: HostTransport, projectId: string, entry: Entry) {
  entry.released = true;
  entry.last = undefined;
  clearTimeout(entry.timer);
  entry.subscription?.close();
  const entries = hubs.get(client);
  if (entries?.get(projectId) === entry) entries.delete(projectId);
}
function open(client: HostTransport, projectId: string, entry: Entry): void {
  watchProjectStream(
    client,
    projectId,
    async (received, assertCurrent) => {
      // The Host re-sends the list on every live change of any of its sessions. A changed list
      // is structurally shared with the last one, so unchanged session rows keep their identity;
      // a deep-equal list keeps the delivered object.
      const value = entry.last ? replaceEqualDeep(entry.last, received) : received;
      const current = () => {
        assertCurrent();
        if (entry.released || entry.last !== value)
          throw new Error("The project stream is no longer current.");
      };
      assertCurrent();
      if (entry.released) throw new Error("The project stream is no longer current.");
      if (entry.last !== value) entry.delivered = new WeakSet();
      entry.last = value;
      entry.attempt = 0;
      // Consumers that already applied this exact snapshot have nothing to write.
      await Promise.all(
        [...entry.listeners]
          .filter((listener) => !entry.delivered.has(listener))
          .map((listener) =>
            listener.apply(value, current).then(
              () => {
                if (entry.last === value) entry.delivered.add(listener);
              },
              (error) => listener.onError(asError(error)),
            ),
          ),
      );
      current();
    },
    (error) => {
      if (entry.released) return;
      if (FATAL_KINDS.includes((error as { kind?: string }).kind ?? ""))
        retire(client, projectId, entry);
      broadcast(entry, error);
    },
  ).then(
    (subscription) => {
      if (entry.released) subscription.close();
      else entry.subscription = subscription;
    },
    (error) => {
      if (entry.released) return;
      const failure = asError(error);
      if (FATAL_KINDS.includes((failure as { kind?: string }).kind ?? "")) {
        // Let the next retain start a fresh attempt instead of reusing a dead entry.
        retire(client, projectId, entry);
        broadcast(entry, failure);
        return;
      }
      broadcast(entry, failure);
      entry.timer = setTimeout(() => {
        if (!entry.released) open(client, projectId, entry);
      }, backoffDelayMs(entry.attempt++));
    },
  );
}
