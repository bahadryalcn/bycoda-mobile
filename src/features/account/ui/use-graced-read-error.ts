import { isTransientConnectionError, visibleReadError } from "@/state/query-retry";
import { useReadRetryNotice } from "@/ui/query-state";

/** A brief link drop on an account read stays quiet until its grace ends; other failures show at once. */
export function useGracedReadError(query: { isError: boolean; error: unknown }) {
  const graceElapsed = useReadRetryNotice(query.isError && isTransientConnectionError(query.error), null);
  return visibleReadError(query.error, graceElapsed);
}
