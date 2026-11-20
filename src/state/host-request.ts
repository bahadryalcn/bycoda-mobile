import type { QueryClient } from "@tanstack/react-query";
import type { HostTransport } from "../remote/transport";
import { expireProjectPrivacy, isProjectPrivacyQuery } from "../features/workspace/project-privacy-cache";

export const hostKey = (machineId: string | null, key: readonly unknown[]) =>
  ["machine", machineId, ...key] as const;
export type HostWrite = {
  client: HostTransport | null;
  method: string;
  params: Record<string, unknown>;
  /** null is an explicit read-only operation; [] retains broad content refresh. */
  invalidate: readonly unknown[] | null;
};
export type HostWriteContext = { machineId: string | null };

/** Variables freeze the destination before Query's asynchronous mutation lifecycle. */
export function hostMutationOptions<T>(cache: QueryClient) {
  return {
    retry: false as const,
    networkMode: "always" as const,
    gcTime: 0,
    onMutate: (write: HostWrite): HostWriteContext => ({
      machineId: write.client?.machine.id ?? null,
    }),
    mutationFn: (write: HostWrite): Promise<T> => {
      if (!write.client) return Promise.reject(new Error("Choose a computer first."));
      return write.client.request<T>(write.method, write.params, { retry: false });
    },
    onSuccess: (_data: T, write: HostWrite): void => {
      if (write.invalidate === null) return;
      const queryKey = hostKey(write.client?.machine.id ?? null, write.invalidate);
      if (write.invalidate.length) expireProjectPrivacy(cache, cache.getQueryCache().findAll({
        queryKey, predicate: ({ queryKey }) => isProjectPrivacyQuery(queryKey),
      }));
      // The Host already confirmed the write. Query marks matches invalid
      // synchronously, so later reads see them stale and in-flight refetches
      // dedupe; the mutation must not stay pending for the refetch itself.
      cache.invalidateQueries({
        queryKey,
        // Only an explicit project mutation or the privacy owner expires proof.
        predicate: ({ queryKey }) => write.invalidate!.length > 0 || !isProjectPrivacyQuery(queryKey),
      }).catch(() => {
        // A failed background refetch surfaces on its own query and retries there.
      });
    },
  };
}
