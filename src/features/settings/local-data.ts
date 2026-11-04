import type { ReviewedMachine } from "@/state/reviewed-machine";
import { isUserDraftKey, withDraftStorageCleanup } from "@/state/local-draft-storage";
import { decodeComposerDraft } from "../workspace/composer-draft";

type DraftStorage = {
  getAllKeys(): Promise<readonly string[]>;
  getItem(key: string): Promise<string | null>;
  multiRemove(keys: string[]): Promise<unknown>;
};

const composerPrefix = "bycoda.mobile.draft.v1:";

/** Never use AsyncStorage.clear: unrelated settings and SDK storage are retained. */
export async function deleteSavedDrafts(storage: DraftStorage, hasConnections: () => boolean, cleanupFiles?: (retainedScopes: readonly string[]) => void | Promise<void>) {
  const check = () => { if (hasConnections()) throw new Error("Disconnect computers before deleting saved drafts."); };
  check();
  return withDraftStorageCleanup(storage, async retire => {
    check();
    const drafts = (await storage.getAllKeys()).filter(isUserDraftKey);
    const retained = new Set<string>();
    for (const key of drafts) if (key.startsWith(composerPrefix)) {
      const raw = await storage.getItem(key);
      if (raw !== null) {
        try { if (decodeComposerDraft(raw).queueIntent) retained.add(key); }
        catch { retained.add(key); }
      }
    }
    check();
    // Retire even empty old stores; their delayed/unmount writes must not resurrect deleted drafts.
    retire(retained);
    const removed = drafts.filter(key => !retained.has(key));
    if (removed.length) await storage.multiRemove(removed);
    check();
    await cleanupFiles?.([...retained].map(key => key.slice(composerPrefix.length)));
    return { removed: removed.length, retained: retained.size };
  });
}

/** Missing reviewed computers are already removed; new or replaced computers require review. */
export function matchesReviewedComputers(reviewed: readonly ReviewedMachine[], current: readonly ReviewedMachine[]): boolean {
  return current.every(machine => reviewed.some(target => target.id === machine.id &&
    target.endpoint === machine.endpoint && target.environmentId === machine.environmentId && target.lanKey === machine.lanKey));
}

export async function disconnectSavedComputers(actions: {
  ready(): boolean;
  reviewed: readonly ReviewedMachine[];
  current(): readonly ReviewedMachine[];
  flush(): Promise<void>;
  cancelQueries(): Promise<void>;
  remove(id: string, expected: ReviewedMachine): Promise<void>;
}) {
  const reviewed = actions.reviewed.map(machine => ({ ...machine }));
  const check = () => {
    if (!actions.ready()) throw new Error("Reload saved connections before removing them.");
    if (!matchesReviewedComputers(reviewed, actions.current())) throw new Error("Saved computers changed. Review the current list before removing connections.");
  };
  check();
  await actions.flush();
  check();
  await actions.cancelQueries();
  check();
  for (const target of reviewed) {
    check();
    if (actions.current().some(machine => machine.id === target.id)) await actions.remove(target.id, target);
  }
}
