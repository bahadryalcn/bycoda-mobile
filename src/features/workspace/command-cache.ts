import type { QueryClient } from "@tanstack/react-query";
import { hostKey } from "@/state/host-request";
import { isProjectPrivacyQuery } from "./project-privacy-cache";

/** Session commands refresh their data without expiring the independent visibility proof. */
export function invalidateCommandQueries(
  cache: QueryClient,
  machineId: string | null,
  scope: readonly unknown[],
) {
  return cache.invalidateQueries({
    queryKey: hostKey(machineId, scope),
    predicate: ({ queryKey }) => !isProjectPrivacyQuery(queryKey),
  });
}
