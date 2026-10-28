import type { QueryClient } from "@tanstack/react-query";
export const projectPrivacyKey = (machineId: string, grouped: boolean) => ["machine", machineId, "projects", ...(grouped ? ["directory"] : []), { method: grouped ? "projects.directory" : "projects.list", params: {} }];
export function isProjectPrivacyQuery(queryKey: readonly unknown[], machineId?: string) {
  return queryKey[0] === "machine" &&
    (machineId === undefined || queryKey[1] === machineId) &&
    queryKey[2] === "projects" &&
    (queryKey[3] === "directory" || !!queryKey[3] && typeof queryKey[3] === "object" &&
      "method" in queryKey[3] && queryKey[3].method === "projects.list");
}
/** Expire visibility proof, not transcripts/drafts, without background refetches. */
export async function invalidateProjectPrivacy(cache: QueryClient, machineId?: string) {
  const predicate = ({ queryKey }: { queryKey: readonly unknown[] }) => isProjectPrivacyQuery(queryKey, machineId);
  // Cancel the retryer before marking the proof expired: an old response must
  // not clear invalidation and restore visibility after a lock/consent change.
  await cache.cancelQueries({ predicate });
  await cache.invalidateQueries({ refetchType: "none", predicate });
}
