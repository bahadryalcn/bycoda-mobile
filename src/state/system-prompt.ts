let open = 0;
let resumePending = false;

/**
 * Runs an app-initiated system permission prompt. iOS reports such a dialog as "inactive", and may
 * deliver that event only after the prompt has already answered. Until the app is active again, that
 * "inactive" keeps the unlocked view (the dialog covers it). Leaving for the background still locks.
 */
export async function duringSystemPrompt<T>(prompt: () => Promise<T>): Promise<T> {
  open++;
  try {
    return await prompt();
  } finally {
    open--;
    if (!open) resumePending = true;
  }
}

/** Whether an "inactive" app state belongs to an app-initiated system prompt; records the state. */
export function inactiveFromSystemPrompt(state: string) {
  const covered = state === "inactive" && (open > 0 || resumePending);
  if (state === "active" || state === "background") resumePending = false;
  return covered;
}
