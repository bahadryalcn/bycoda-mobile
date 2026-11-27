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
function parseDraft(value: unknown): LocalNoteDraft {
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
/** Stored drafts, oldest edit first. One computer keeps one draft per note. */
type StoredDrafts = { version: 2; drafts: LocalNoteDraft[] };
function parse(raw: string | null): LocalNoteDraft[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  // A single draft is the earlier one-draft-per-computer format.
  if (value && typeof value === "object" && (value as StoredDrafts).version === 2) {
    const drafts = (value as StoredDrafts).drafts;
    if (!Array.isArray(drafts)) throw new Error("Invalid local note draft.");
    return drafts.map(parseDraft);
  }
  return [parseDraft(value)];
}
const matches = (a: LocalNoteDraft, b: LocalNoteDraft) =>
  a.id === b.id &&
  a.title === b.title &&
  a.body === b.body &&
  a.tags === b.tags &&
  a.sourceCwd === b.sourceCwd &&
  a.expectedUpdatedAt === b.expectedUpdatedAt;
/** A new note with nothing typed is not worth recovering. */
const blankNewNote = (draft: LocalNoteDraft) =>
  draft.expectedUpdatedAt === 0 && !draft.title.trim() && !draft.body.trim() && !draft.tags.trim();
export function createNoteDraftStore(storage: Storage) {
  const bind = (machineId: string) => {
    const key = noteDraftKey(machineId), owner = createDraftStorageOwner(storage, key);
    const write = async (drafts: LocalNoteDraft[]) => {
      if (drafts.length) await storage.setItem(key, JSON.stringify({ version: 2, drafts } satisfies StoredDrafts));
      else await storage.removeItem(key);
    };
    return {
      /** Keeps each note's draft separately; editing one note never replaces another note's draft. */
      save: (draft: LocalNoteDraft) => owner.run(async () => {
        const current = parse(await storage.getItem(key));
        const others = current.filter((entry) => entry.id !== draft.id);
        if (blankNewNote(draft)) {
          if (others.length !== current.length) await write(others);
          return;
        }
        await write([...others, draft]);
      }),
      /** The most recently edited draft, or the draft of one note. */
      recover: (id?: string) => owner.run(async () => {
        const drafts = parse(await storage.getItem(key));
        return (id === undefined ? drafts.at(-1) : drafts.find((draft) => draft.id === id)) ?? null;
      }),
      /** Every saved draft, most recently edited first. */
      recoverAll: () => owner.run(async () => parse(await storage.getItem(key)).reverse()),
      clearSaved: (saved: LocalNoteDraft) => owner.run(async () => {
        const current = parse(await storage.getItem(key));
        const next = current.filter((entry) => !matches(entry, saved));
        if (next.length !== current.length) await write(next);
      }),
      /** Removes one note's draft at the owner's request, whatever it contains. */
      discard: (id: string) => owner.run(async () => {
        const current = parse(await storage.getItem(key));
        const next = current.filter((entry) => entry.id !== id);
        if (next.length !== current.length) await write(next);
      }),
    };
  };
  const owners = new Map<string, ReturnType<typeof bind>>();
  const existing = (machineId: string) => { let owner = owners.get(machineId); if (!owner) { owner = bind(machineId); owners.set(machineId, owner); } return owner; };
  return { bind,
    save: (machineId: string, draft: LocalNoteDraft) => existing(machineId).save(draft),
    recover: (machineId: string, id?: string) => existing(machineId).recover(id),
    recoverAll: (machineId: string) => existing(machineId).recoverAll(),
    clearSaved: (machineId: string, saved: LocalNoteDraft) => existing(machineId).clearSaved(saved),
    discard: (machineId: string, id: string) => existing(machineId).discard(id),
  };
}
/** A machine-scoped store handle whose epoch was captured when its editor opened. */
export type NoteDraftOwner = ReturnType<ReturnType<typeof createNoteDraftStore>["bind"]>;
