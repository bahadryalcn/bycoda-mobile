type Registration = { flush: () => Promise<void> };
const drafts = new Map<string, Registration>();

/** A replaced screen must not unregister a newer editor for the same draft key. */
export function registerWorkspaceDraft(id: string, flush: () => Promise<void>) {
  const registration = { flush };
  drafts.set(id, registration);
  return () => {
    if (drafts.get(id) === registration) drafts.delete(id);
  };
}

/** Failed storage leaves the current computer and all editors available for retry. */
export async function flushWorkspaceDrafts() {
  for (const registration of [...drafts.values()]) await registration.flush();
}
