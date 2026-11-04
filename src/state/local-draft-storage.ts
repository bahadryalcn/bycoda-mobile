type Job = Promise<unknown>;
type State = { barrier: Job; pending: Map<string, Job>; epoch: number; versions: Map<string, number>; listeners: Map<string, Set<() => void>>; cleanups: number };
const states = new WeakMap<object, State>();
const prefixes = ["bycoda.mobile.draft.v1:", "bycoda.mobile.file-draft.v1:", "bycoda.mobile.note-draft.", "bycoda.mobile.git-draft.v1:", "bycoda.mobile.queue-edit.v1:"];
export const isUserDraftKey = (key: string) => prefixes.some(prefix => key.startsWith(prefix));
function stateFor(storage: object): State {
  let state = states.get(storage);
  if (!state) { state = { barrier: Promise.resolve(), pending: new Map(), epoch: 0, versions: new Map(), listeners: new Map(), cleanups: 0 }; states.set(storage, state); }
  return state;
}
export function draftEpoch(storage: object, key: string): number {
  const state = stateFor(storage);
  if (!isUserDraftKey(key)) return 0;
  if (!state.versions.has(key)) state.versions.set(key, state.epoch);
  return state.versions.get(key)!;
}
export function subscribeDraftEpoch(storage: object, key: string, listener: () => void) {
  const state = stateFor(storage); draftEpoch(storage, key);
  const listeners = state.listeners.get(key) ?? new Set(); state.listeners.set(key, listeners); listeners.add(listener);
  return () => { listeners.delete(listener); if (!listeners.size) state.listeners.delete(key); };
}
export class RetiredDraftError extends Error { constructor() { super("This saved draft was cleared. Reopen its editor before changing it."); } }
function enqueue<T>(state: State, key: string, operation: () => Promise<T>): Promise<T> {
  const job = Promise.all([state.barrier.catch(() => {}), state.pending.get(key)?.catch(() => {})]).then(operation);
  state.pending.set(key, job);
  const settled = () => { if (state.pending.get(key) === job) state.pending.delete(key); };
  void job.then(settled, settled); return job;
}
/** Capture once per editor owner, never when a delayed save callback eventually runs. */
export function createDraftStorageOwner(storage: object, key: string) {
  const state = stateFor(storage), epoch = draftEpoch(storage, key);
  const current = () => draftEpoch(storage, key) === epoch;
  const check = () => { if (!current()) throw new RetiredDraftError(); };
  return { current,
    run<T>(operation: () => Promise<T>): Promise<T> { return enqueue(state, key, async () => { check(); return operation(); }); },
    runSync<T>(operation: () => T): T { check(); if (state.cleanups) throw new Error("Saved drafts are being cleared. Try again after cleanup finishes."); return operation(); },
  };
}
/** Drain earlier draft work and hold later work; cleanup uses raw storage inside this boundary. */
export function withDraftStorageCleanup<T>(storage: object, operation: (retire: (retained: ReadonlySet<string>) => void) => Promise<T>): Promise<T> {
  const state = stateFor(storage), earlier = [state.barrier, ...state.pending.values()]; state.cleanups++;
  const task = Promise.all(earlier.map(job => job.catch(() => {}))).then(() => operation(retained => {
    state.epoch++;
    for (const key of state.versions.keys()) if (isUserDraftKey(key) && !retained.has(key)) state.versions.set(key, state.epoch);
    for (const [key, listeners] of [...state.listeners]) if (isUserDraftKey(key) && !retained.has(key)) for (const listener of [...listeners]) listener();
  })).finally(() => { state.cleanups--; });
  state.barrier = task.then(() => {}, () => {}); return task;
}
