import type { ReviewedMachine } from "@/state/reviewed-machine";

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

/** Another connection change (for example an automatic route switch) is still running. */
export class ConnectionBusyError extends ConnectionRecoveryError {}

/** How long a selection waits for a running connection change before asking to try again. */
const SETTLE_WAIT_MS = 5_000;

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

/** Verify the selected computer against current storage state after the asynchronous draft flush. */
export async function selectSavedComputer(
  id: string,
  actions: DraftAccess & {
    getState(): SelectionState;
    selectMachine(id: string): void;
    onSelected(): void;
    /** Settles when running connection changes finish; without it a running change rejects the selection. */
    settled?(): Promise<void>;
  },
): Promise<void> {
  actions.assertAccess();
  await actions.flushDrafts();
  actions.assertAccess();
  let current = actions.getState();
  if (current.connectionPending && actions.settled && current.hydrated && !current.storageError) {
    // A short background change (route switch, descriptor refresh) finishes on its own; wait for it.
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      actions.settled(),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, SETTLE_WAIT_MS); }),
    ]).finally(() => clearTimeout(timer));
    actions.assertAccess();
    current = actions.getState();
    if (current.hydrated && !current.storageError && current.connectionPending) throw new ConnectionBusyError();
  }
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
  actions.onSelected();
}


export class ConnectionRemovalError extends ConnectionRecoveryError {}

/**
 * The reviewed computer is still saved: same entry and same computer identity. Its route (address and
 * local-network key) may change underneath the review, e.g. an automatic switch between the local
 * network and Tailscale; that is still the computer the owner chose to remove.
 */
export function matchesSavedComputer(review: ReviewedMachine, state: {
  hydrated: boolean; storageError: string | null; connectionPending: boolean;
  machines: readonly ReviewedMachine[];
}): boolean {
  return state.hydrated && !state.storageError &&
    state.machines.some(machine => machine.id === review.id && machine.environmentId === review.environmentId);
}

/** The store rechecks this exact identity inside its serialized credential mutation. */
export async function removeSavedComputer(review: ReviewedMachine, actions: DraftAccess & {
  getState(): Parameters<typeof matchesSavedComputer>[1];
  reviewValid(): boolean;
  remove(id: string, expected: ReviewedMachine): Promise<void>;
}): Promise<void> {
  const reviewed: ReviewedMachine = { id: review.id, endpoint: review.endpoint, environmentId: review.environmentId, lanKey: review.lanKey };
  const check = (): ReviewedMachine => {
    actions.assertAccess();
    const state = actions.getState();
    if (!actions.reviewValid() || state.connectionPending || !matchesSavedComputer(reviewed, state))
      throw new ConnectionRemovalError();
    // The route current at submit is the one removed; the store rejects any change after this point.
    const current = state.machines.find((machine) => machine.id === reviewed.id)!;
    return { id: current.id, endpoint: current.endpoint, environmentId: current.environmentId, lanKey: current.lanKey };
  };
  check();
  await actions.flushDrafts();
  const expected = check();
  await actions.remove(expected.id, expected);
}
