import type { QueryClient } from "@tanstack/react-query";
import type { HostTransport } from "../remote/transport";

export const hostKey = (machineId: string | null, key: readonly unknown[]) =>
  ["machine", machineId, ...key] as const;
export type HostWrite = {
  client: HostTransport | null;
  method: string;
  params: Record<string, unknown>;
  invalidate: readonly unknown[];
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
    onSuccess: (_data: T, write: HostWrite) =>
      cache.invalidateQueries({
        queryKey: hostKey(write.client?.machine.id ?? null, write.invalidate),
      }),
  };
}
