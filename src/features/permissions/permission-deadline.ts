/**
 * A status read never shows a prompt, so it must settle quickly. Without a deadline a native read
 * that never answers keeps a row busy forever; callers turn the TimeoutError into their read-error
 * state with a retry.
 */
export const PERMISSION_READ_TIMEOUT_MS = 8_000;
