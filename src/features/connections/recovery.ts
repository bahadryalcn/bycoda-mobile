type DraftAccess = {
  flushDrafts(): Promise<void>;
  assertAccess(): void;
};
type SelectionState = {
  hydrated: boolean;
  storageError: string | null;
  connectionPending: boolean;
  activeId: string | null;
  machines: readonly { id: string }[];
};

export class ConnectionRecoveryError extends Error {
  constructor() {
    super("Computer selection is unavailable. Reload saved connections and try again.");
  }
}

/** A failed draft write keeps the mounted workspace available for retry. */
export async function reloadSavedConnections(
  actions: DraftAccess & {
    hydrate(): Promise<void>;
    getState(): Pick<SelectionState, "hydrated" | "storageError">;
  },
): Promise<void> {
  actions.assertAccess();
  await actions.flushDrafts();
  actions.assertAccess();
  await actions.hydrate();
  actions.assertAccess();
  const current = actions.getState();
  if (!current.hydrated || current.storageError) throw new ConnectionRecoveryError();
}

/** Selection and navigation use current storage state after the asynchronous draft flush. */
export async function selectSavedComputer(
  id: string,
  actions: DraftAccess & {
    getState(): SelectionState;
    selectMachine(id: string): void;
    navigate(): void;
  },
): Promise<void> {
  actions.assertAccess();
  await actions.flushDrafts();
  actions.assertAccess();
  const current = actions.getState();
  if (
    !current.hydrated ||
    current.storageError ||
    current.connectionPending ||
    !current.machines.some((machine) => machine.id === id)
  )
    throw new ConnectionRecoveryError();
  actions.selectMachine(id);
  const selected = actions.getState();
  actions.assertAccess();
  if (
    !selected.hydrated ||
    selected.storageError ||
    selected.connectionPending ||
    selected.activeId !== id
  )
    throw new ConnectionRecoveryError();
  actions.navigate();
}
