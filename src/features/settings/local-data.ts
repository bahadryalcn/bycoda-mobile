type DraftStorage = {
  getAllKeys(): Promise<readonly string[]>;
  multiRemove(keys: string[]): Promise<unknown>;
};

const draftPrefixes = [
  "bycoda.mobile.draft.v1:",
  "bycoda.mobile.file-draft.v1:",
  "bycoda.mobile.note-draft.",
  "bycoda.mobile.git-draft.v1:",
];

/** Never use AsyncStorage.clear: unrelated settings and SDK storage are retained. */
export async function deleteSavedDrafts(storage: DraftStorage, hasConnections: () => boolean) {
  if (hasConnections()) throw new Error("Disconnect computers before deleting saved drafts.");
  const keys = await storage.getAllKeys();
  if (hasConnections()) throw new Error("Disconnect computers before deleting saved drafts.");
  const drafts = keys.filter((key) => draftPrefixes.some((prefix) => key.startsWith(prefix)));
  if (drafts.length) await storage.multiRemove(drafts);
  return drafts.length;
}

export async function disconnectSavedComputers(actions: {
  ready(): boolean;
  ids(): string[];
  flush(): Promise<void>;
  cancelQueries(): Promise<void>;
  remove(id: string): Promise<void>;
}) {
  if (!actions.ready()) throw new Error("Reload saved connections before removing them.");
  await actions.flush();
  await actions.cancelQueries();
  if (!actions.ready()) throw new Error("Reload saved connections before removing them.");
  for (const id of actions.ids()) await actions.remove(id);
}
