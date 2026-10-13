export type LocalNoteDraft = {
  id: string;
  title: string;
  body: string;
  tags: string;
  sourceCwd?: string;
  expectedUpdatedAt: number;
};
type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
};
const keyFor = (machineId: string) => `bycoda.mobile.note-draft.${machineId}`;
function parse(raw: string | null): LocalNoteDraft | null {
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw new Error("Invalid local note draft.");
  const draft = value as LocalNoteDraft;
  if (
    typeof draft.id !== "string" ||
    typeof draft.title !== "string" ||
    typeof draft.body !== "string" ||
    typeof draft.tags !== "string" ||
    !Number.isFinite(draft.expectedUpdatedAt) ||
    draft.expectedUpdatedAt < 0 ||
    (draft.sourceCwd !== undefined && typeof draft.sourceCwd !== "string")
  )
    throw new Error("Invalid local note draft.");
  return draft;
}
const matches = (a: LocalNoteDraft, b: LocalNoteDraft) =>
  a.id === b.id &&
  a.title === b.title &&
  a.body === b.body &&
  a.tags === b.tags &&
  a.sourceCwd === b.sourceCwd &&
  a.expectedUpdatedAt === b.expectedUpdatedAt;
export function createNoteDraftStore(storage: Storage) {
  const queues = new Map<string, Promise<unknown>>();
  const enqueue = <T>(machineId: string, action: (key: string) => Promise<T>) => {
    const key = keyFor(machineId);
    const pending = (queues.get(key) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => action(key));
    queues.set(key, pending);
    void pending.then(
      () => {
        if (queues.get(key) === pending) queues.delete(key);
      },
      () => {
        if (queues.get(key) === pending) queues.delete(key);
      },
    );
    return pending;
  };
  return {
    save: (machineId: string, draft: LocalNoteDraft) =>
      enqueue(machineId, async (key) => {
        await storage.setItem(key, JSON.stringify(draft));
      }),
    recover: (machineId: string) =>
      enqueue(machineId, async (key) => parse(await storage.getItem(key))),
    clearSaved: (machineId: string, saved: LocalNoteDraft) =>
      enqueue(machineId, async (key) => {
        const current = parse(await storage.getItem(key));
        if (current && matches(current, saved)) await storage.removeItem(key);
      }),
  };
}
