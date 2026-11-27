import { AccountApiError } from "../contracts/errors";
import { usePersistentError } from "@/ui/use-persistent-error";

/** Access problems on the account service cannot heal by themselves; they show at once. */
const LASTING_CODES = new Set(["unauthorized", "forbidden"]);

/**
 * An account read follows the shared persistent-error rule: a failure that clears itself (a brief
 * link drop, one failed refresh) is never shown, a lasting one shows, and recovery removes it.
 */
export function useGracedReadError(query: { isError: boolean; error: unknown; data?: unknown }) {
  const error = query.isError ? query.error : null;
  const lasting = error instanceof AccountApiError && LASTING_CODES.has(error.code);
  return usePersistentError(error, { hasData: query.data !== undefined, graceMs: lasting ? 0 : undefined });
}
