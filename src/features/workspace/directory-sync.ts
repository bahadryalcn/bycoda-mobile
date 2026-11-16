import { hashKey, type QueryClient } from "@tanstack/react-query";
import type { HostProjectDirectory } from "@/domain/types";
import type { HostTransport, MobileStreamPhase, MobileStreamSubscription } from "@/remote/host-transport";
import { backoffDelayMs } from "@/remote/backoff";
import {
  DIRECTORY_STREAM_CAPABILITY,
  DirectoryStreamSchemaError,
  parseDirectoryStream,
} from "@/remote/directory-stream";

/**
 * - `polling`: no live stream (unsupported, incompatible or refused); the directory poll owns freshness.
 * - `catching-up`: the stream is opening or resyncing; cached data is not yet confirmed.
 * - `live`: the last Host snapshot was committed and nothing newer is pending.
 * - `stale`: the stream dropped or was held back; the poll covers until it recovers.
 */
export type DirectorySyncState = "polling" | "catching-up" | "live" | "stale";
type Retainer = { key: readonly unknown[]; canApply(): boolean };
type Slot = {
  client: HostTransport;
  state: DirectorySyncState;
  listeners: Set<() => void>;
  retainers: Set<Retainer & { client: HostTransport }>;
  subscription?: MobileStreamSubscription;
  opening: boolean;
  stopped: boolean;
  /** Live sync was given up (unsupported or incompatible); only a new retain tries again. */
  gaveUp: boolean;
  /** Identifies one stream attempt; callbacks of an older attempt are ignored. */
  epoch: number;
  attempt: number;
  timer?: ReturnType<typeof setTimeout>;
};

// Hooks create separate transports. Share their stream only for the exact paired route.
const slots = new WeakMap<QueryClient, Set<Slot>>();
// Counts committed stream snapshots per directory key, so an older RPC read cannot overwrite one.
const generations = new WeakMap<QueryClient, Map<string, number>>();
const FATAL_KINDS = ["auth", "identity", "unsupported"];

export function supportsDirectoryStream(client: HostTransport): boolean {
  return (
    !!client.machine?.capabilities?.includes(DIRECTORY_STREAM_CAPABILITY) &&
    (client.supportsStreams?.() ?? false)
  );
}

function slotFor(cache: QueryClient, client: HostTransport): Slot {
  let byClient = slots.get(cache);
  if (!byClient) slots.set(cache, (byClient = new Set()));
  let slot = [...byClient].find(({ client: owner }) =>
    owner.machine.id === client.machine.id &&
    owner.machine.environmentId === client.machine.environmentId &&
    owner.endpoint === client.endpoint && owner.machine.lanKey === client.machine.lanKey &&
    JSON.stringify(owner.machine.capabilities) === JSON.stringify(client.machine.capabilities),
  );
  if (!slot) {
    slot = {
      client,
      state: supportsDirectoryStream(client) ? "catching-up" : "polling",
      listeners: new Set(),
      retainers: new Set(),
      opening: false,
      stopped: true,
      gaveUp: false,
      epoch: 0,
      attempt: 0,
    };
    byClient.add(slot);
  }
  return slot;
}
function setState(slot: Slot, state: DirectorySyncState): void {
  if (slot.state === state) return;
  slot.state = state;
  for (const notify of [...slot.listeners]) notify();
}
function allowed(slot: Slot): boolean {
  return slot.retainers.size > 0 && [...slot.retainers].every((retainer) => retainer.canApply());
}
const generationOf = (cache: QueryClient, key: readonly unknown[]) =>
  generations.get(cache)?.get(hashKey(key)) ?? 0;

export function directorySyncState(cache: QueryClient, client: HostTransport): DirectorySyncState {
  return slotFor(cache, client).state;
}
export function subscribeDirectorySync(
  cache: QueryClient,
  client: HostTransport,
  notify: () => void,
): () => void {
  const slot = slotFor(cache, client);
  slot.listeners.add(notify);
  return () => {
    slot.listeners.delete(notify);
    if (!slot.listeners.size && !slot.retainers.size) slots.get(cache)?.delete(slot);
  };
}

/**
 * A snapshot the stream committed while an RPC read was in flight is newer than that read.
 * Take the mark before sending the request; settle its result with the returned function.
 */
export function directoryReadFence(
  cache: QueryClient,
  key: readonly unknown[],
): (result: HostProjectDirectory) => HostProjectDirectory {
  const mark = generationOf(cache, key);
  return (result) =>
    generationOf(cache, key) === mark ? result : (cache.getQueryData<HostProjectDirectory>(key) ?? result);
}

/**
 * Keep the project directory live for this transport. Every caller shares one environment
 * stream; each snapshot replaces the cached directory (groups, privacy proof, removals).
 * `canApply` is the reader's current access check, evaluated again before every write.
 */
export function retainDirectorySync(
  cache: QueryClient,
  client: HostTransport,
  options: Retainer,
): () => void {
  const slot = slotFor(cache, client);
  const owner = { ...options, client };
  slot.retainers.add(owner);
  if (slot.retainers.size === 1) {
    slot.client = client;
    begin(cache, slot);
  }
  return () => {
    if (!slot.retainers.delete(owner)) return;
    if (slot.retainers.size) {
      if ([...slot.retainers].some((retainer) => retainer.client === slot.client)) return;
      // The transport belongs to its hook and is disposed when that hook unmounts.
      // Transfer the stream to a surviving reader, fencing the old callbacks first.
      slot.epoch++;
      clearTimeout(slot.timer);
      slot.timer = undefined;
      slot.subscription?.close();
      slot.subscription = undefined;
      slot.client = [...slot.retainers][0]!.client;
      setState(slot, slot.gaveUp ? "polling" : "catching-up");
      open(cache, slot);
      return;
    }
    slot.stopped = true;
    slot.epoch++;
    clearTimeout(slot.timer);
    slot.timer = undefined;
    slot.subscription?.close();
    slot.subscription = undefined;
    slot.state = supportsDirectoryStream(client) ? "catching-up" : "polling";
    if (!slot.listeners.size) slots.get(cache)?.delete(slot);
  };
}

function begin(cache: QueryClient, slot: Slot): void {
  slot.stopped = false;
  slot.gaveUp = false;
  slot.attempt = 0;
  if (!supportsDirectoryStream(slot.client)) return setState(slot, "polling");
  setState(slot, "catching-up");
  open(cache, slot);
}

function fatal(error: unknown): boolean {
  return (
    error instanceof DirectoryStreamSchemaError ||
    FATAL_KINDS.includes((error as { kind?: string } | null)?.kind ?? "")
  );
}
/** Give up on live sync for this attempt: the poll keeps the directory fresh. */
function abandon(slot: Slot): void {
  slot.gaveUp = true;
  slot.epoch++;
  clearTimeout(slot.timer);
  slot.timer = undefined;
  slot.subscription?.close();
  slot.subscription = undefined;
  setState(slot, "polling");
}
/** Close this stream and open a fresh one (new baseline) after a backoff. */
function reopenLater(cache: QueryClient, slot: Slot): void {
  slot.epoch++;
  slot.subscription?.close();
  slot.subscription = undefined;
  setState(slot, "stale");
  if (slot.timer || slot.stopped) return;
  slot.timer = setTimeout(() => {
    slot.timer = undefined;
    open(cache, slot);
  }, backoffDelayMs(slot.attempt++));
}

function open(cache: QueryClient, slot: Slot): void {
  if (slot.stopped || slot.gaveUp || slot.opening || slot.subscription) return;
  slot.opening = true;
  const client = slot.client;
  const epoch = ++slot.epoch;
  const live = () => !slot.stopped && slot.epoch === epoch;
  client
    .observeStream(
      { kind: "environment" },
      async (event, assertCurrent) => {
        assertCurrent();
        client.assertCurrentAccess();
        if (!live()) return false;
        if (event.params.kind !== "snapshot") return "resync";
        let directory: HostProjectDirectory;
        try {
          directory = parseDirectoryStream(event.params.data);
        } catch (error) {
          if (live()) abandon(slot);
          throw error;
        }
        const key = [...slot.retainers][0]?.key;
        if (!key || !allowed(slot)) {
          // Privacy or consent forbids showing it, and a dropped event is never replayed:
          // discard this stream and ask for a fresh baseline later.
          if (live()) reopenLater(cache, slot);
          return false;
        }
        // An in-flight RPC read is older than this snapshot; it must not land after it.
        await cache.cancelQueries({ queryKey: key, exact: true }, { silent: true, revert: false });
        assertCurrent();
        client.assertCurrentAccess();
        if (!live()) return false;
        if (!allowed(slot)) {
          reopenLater(cache, slot);
          return false;
        }
        let counts = generations.get(cache);
        if (!counts) generations.set(cache, (counts = new Map()));
        counts.set(hashKey(key), generationOf(cache, key) + 1);
        cache.setQueryData<HostProjectDirectory>(key, directory);
        slot.attempt = 0;
        setState(slot, "live");
        return true;
      },
      (error) => {
        if (!live()) return;
        if (fatal(error)) abandon(slot);
        else setState(slot, "stale");
      },
      (phase: MobileStreamPhase) => {
        if (live() && phase === "catching-up" && slot.state === "live") setState(slot, "catching-up");
      },
    )
    .then(
      (subscription) => {
        slot.opening = false;
        if (live()) return void (slot.subscription = subscription);
        subscription.close();
        // A consumer that returned while this attempt was opening still needs a stream.
        open(cache, slot);
      },
      (error: unknown) => {
        slot.opening = false;
        if (!live()) return open(cache, slot);
        if (fatal(error)) return abandon(slot);
        reopenLater(cache, slot);
      },
    );
}
