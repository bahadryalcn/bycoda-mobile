import { createDraftStorageOwner } from "@/state/local-draft-storage";
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
export const noteDraftKey = (machineId: string) => `bycoda.mobile.note-draft.${machineId}`;
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
  const bind = (machineId: string) => {
    const key = noteDraftKey(machineId), owner = createDraftStorageOwner(storage, key);
    return {
      save: (draft: LocalNoteDraft) => owner.run(async () => { await storage.setItem(key, JSON.stringify(draft)); }),
      recover: () => owner.run(async () => parse(await storage.getItem(key))),
      clearSaved: (saved: LocalNoteDraft) => owner.run(async () => {
        const current = parse(await storage.getItem(key));
        if (current && matches(current, saved)) await storage.removeItem(key);
      }),
    };
  };
  const owners = new Map<string, ReturnType<typeof bind>>();
  const existing = (machineId: string) => { let owner = owners.get(machineId); if (!owner) { owner = bind(machineId); owners.set(machineId, owner); } return owner; };
  return { bind,
    save: (machineId: string, draft: LocalNoteDraft) => existing(machineId).save(draft),
    recover: (machineId: string) => existing(machineId).recover(),
    clearSaved: (machineId: string, saved: LocalNoteDraft) => existing(machineId).clearSaved(saved),
  };
}
