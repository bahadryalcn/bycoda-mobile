import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import type { HostTransport } from "@/remote/transport";
import type { RemoteRequestOptions } from "@/remote/types";
import type { SharedQueue } from "../../../../src/features/connections/model/sharedQueue";
import type { QueuedMessage } from "../../../../src/features/sessions/model/session";
import { decodeQueuedMessageEdit } from "./composer-queue-edit";
import { supportsAttachmentOwnership } from "./attachment-ownership";

type Storage = Pick<typeof AsyncStorage, "getItem" | "setItem">;
type Claim = { id: string; claimId: string };
type State = { version: 1; generation: string; held: Claim[]; snapshot: Claim[]; releasing: Claim[]; reserved: string[] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const queueEditDraftKey = (machineId: string, sessionId: string) => `bycoda.mobile.queue-edit.v1:${machineId}:${sessionId}`;
const idsOf = (messages: readonly QueuedMessage[]) => [...new Set(messages.flatMap((row) => row.attachments.map((file) => file.id)).filter((id) => uuid.test(id)))];

/** One durable attachment view owner per computer/session, independent of the
 * queue scheduler's consumer ID. Offline queue edits keep their original refs. */
export class QueueAttachmentOwnership {
  private tail: Promise<unknown> = Promise.resolve();
  private reserving = false;
  constructor(private readonly storage: Storage, private readonly machineId: string,
    private readonly environmentId: string, private readonly sessionId: string, private readonly nonce = randomUUID) {}
  private get key() { return `bycoda.mobile.queue-attachments.v1:${this.machineId}:${this.environmentId}:${this.sessionId}`; }
  private get ownerId() {
    const owner = `mobile-queue:${this.sessionId}`;
    if (owner.length > 128) throw new Error("Invalid queue attachment owner.");
    return owner;
  }
  private ordered<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.tail.catch(() => undefined).then(operation); this.tail = pending.then(() => undefined, () => undefined); return pending;
  }
  private async load(): Promise<State> {
    const raw = await this.storage.getItem(this.key);
    if (raw === null) return { version: 1, generation: this.nonce(), held: [], snapshot: [], releasing: [], reserved: [] };
    const state = JSON.parse(raw) as State;
    const validIds = (value: unknown) => Array.isArray(value) && value.every((id) => typeof id === "string" && uuid.test(id));
    const validClaims = (value: unknown) => Array.isArray(value) && value.every((entry) => entry && uuid.test(entry.id) && typeof entry.claimId === "string" && entry.claimId.length <= 128);
    if (state?.version !== 1 || !uuid.test(state.generation) || !validClaims(state.snapshot) || !validIds(state.reserved) || !validClaims(state.held) || !validClaims(state.releasing))
      throw new Error("Saved queue attachment ownership could not be read.");
    return state;
  }
  private save(state: State) { return this.storage.setItem(this.key, JSON.stringify(state)); }
  private async editorIds(): Promise<string[]> {
    const raw = await this.storage.getItem(queueEditDraftKey(this.machineId, this.sessionId));
    return raw === null ? [] : idsOf([decodeQueuedMessageEdit(raw).original]);
  }
  private assertMachine(client: HostTransport) {
    if (client.machine.id !== this.machineId || client.machine.environmentId !== this.environmentId)
      throw new Error("Queue attachment computer identity changed.");
  }
  private retain(state: State, ids: readonly string[]) {
    for (const id of ids) {
      if (!uuid.test(id)) throw new Error("Invalid queued attachment ID.");
      if (!state.held.some((claim) => claim.id === id && claim.claimId === state.generation)) state.held.push({ id, claimId: state.generation });
    }
  }
  private async reconcileHost(client: HostTransport, state: State, options: RemoteRequestOptions): Promise<Set<string>> {
    const current = new Set([...state.snapshot.map((entry) => entry.id), ...state.reserved, ...await this.editorIds()]);
    const ids = [...current];
    // Renew every authoritative local consumer before releasing any older claim.
    for (let at = 0; at < ids.length; at += 20)
      await client.request("attachments.claim", { ownerId: this.ownerId, claimId: state.generation, ids: ids.slice(at, at + 20) }, { signal: options.signal, retry: false });
    this.retain(state, ids);
    state.snapshot = state.snapshot.map((entry) => ({ id: entry.id, claimId: state.generation }));
    await this.save(state);
    let after: Claim | undefined;
    const cursors = new Set<string>();
    do {
      const page = await client.request<{ claims: Claim[]; next?: Claim }>("attachments.claims", { ownerId: this.ownerId, ...(after ? { after } : {}) }, { signal: options.signal });
      const valid = (entry: Claim) => entry && uuid.test(entry.id) && typeof entry.claimId === "string" && entry.claimId.length <= 128;
      if (!page || !Array.isArray(page.claims) || page.claims.length > 200 || !page.claims.every(valid) || (page.next !== undefined && !valid(page.next)))
        throw new Error("Invalid attachment claim inventory.");
      for (const claim of page.claims)
        if (!state.held.some((entry) => entry.id === claim.id && entry.claimId === claim.claimId)) state.held.push(claim);
      await this.save(state);
      after = page.next;
      if (after) {
        const cursor = JSON.stringify(after);
        if (cursors.has(cursor)) throw new Error("Attachment claim inventory did not advance.");
        cursors.add(cursor);
      }
    } while (after);
    return current;
  }
  private async drain(client: HostTransport, state: State, renewed?: ReadonlySet<string>) {
    for (;;) {
      const editor = new Set([...state.reserved, ...await this.editorIds()]);
      const eligible = state.held.filter((claim) => !(editor.has(claim.id) && (!renewed?.has(claim.id) || claim.claimId === state.generation)) && !state.snapshot.some((view) => view.id === claim.id && view.claimId === claim.claimId));
      const first = eligible[0];
      if (!first) return;
      const claimId = first.claimId;
      let ids = eligible.filter((entry) => entry.claimId === claimId).slice(0, 20).map((entry) => entry.id);
      for (const id of ids)
        if (!state.releasing.some((entry) => entry.id === id && entry.claimId === claimId)) state.releasing.push({ id, claimId });
      await this.save(state);
      // Recheck the durable edit immediately before an exact-generation release.
      const latest = new Set([...state.reserved, ...await this.editorIds()]);
      ids = ids.filter((id) => !latest.has(id) || (renewed?.has(id) && claimId !== state.generation));
      if (!ids.length) continue;
      await client.request("attachments.release", { ownerId: this.ownerId, claimId, ids }, { retry: false });
      state.held = state.held.filter((entry) => entry.claimId !== claimId || !ids.includes(entry.id));
      state.releasing = state.releasing.filter((entry) => entry.claimId !== claimId || !ids.includes(entry.id));
      await this.save(state);
    }
  }
  request(client: HostTransport, method: string, params: Record<string, unknown>, options: RemoteRequestOptions = {}): Promise<SharedQueue> {
    this.assertMachine(client);
    if (!supportsAttachmentOwnership(client)) return client.request<SharedQueue>(method, params, options);
    return this.ordered(async () => {
      const state = await this.load();
      if (state.releasing.some((entry) => entry.claimId === state.generation)) state.generation = this.nonce();
      if (!this.reserving) state.reserved = [];
      // Persist the nonce before the host exports any host-only attachment refs.
      await this.save(state);
      const result = await client.request<SharedQueue>(method, { ...params, ownerId: this.ownerId, claimId: state.generation }, options);
      const ids = idsOf(result.messages);
      this.retain(state, ids); state.snapshot = ids.map((id) => ({ id, claimId: state.generation }));
      await this.save(state);
      try {
        const renewed = await this.reconcileHost(client, state, options);
        await this.drain(client, state, renewed);
      } catch { /* Failed inventory never authorizes orphan deletion; retry on the next snapshot. */ }
      return result;
    });
  }
  retainEdit(client: HostTransport, row: QueuedMessage): Promise<void> {
    this.assertMachine(client);
    if (!supportsAttachmentOwnership(client)) return Promise.resolve();
    return this.ordered(async () => {
      const state = await this.load();
      if (state.releasing.some((entry) => entry.claimId === state.generation)) state.generation = this.nonce();
      const ids = idsOf([row]); this.reserving = true;
      state.reserved = [...new Set([...state.reserved, ...ids])]; this.retain(state, ids);
      await this.save(state);
      for (let at = 0; at < ids.length; at += 20)
        await client.request("attachments.claim", { ownerId: this.ownerId, claimId: state.generation, ids: ids.slice(at, at + 20) }, { retry: false });
    });
  }
  persistedEdit(client: HostTransport): Promise<void> {
    this.assertMachine(client);
    if (!supportsAttachmentOwnership(client)) return Promise.resolve();
    return this.ordered(async () => {
      const state = await this.load(); await this.editorIds();
      this.reserving = false; state.reserved = [];
      await this.save(state); await this.drain(client, state);
    });
  }
}
const owners = new Map<string, QueueAttachmentOwnership>();
export function queueAttachmentOwner(client: HostTransport, sessionId: string): QueueAttachmentOwnership {
  const key = `${client.machine.id}:${client.machine.environmentId}:${sessionId}`;
  let owner = owners.get(key);
  if (!owner) { owner = new QueueAttachmentOwnership(AsyncStorage, client.machine.id, client.machine.environmentId, sessionId); owners.set(key, owner); }
  return owner;
}
