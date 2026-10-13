import { useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { createSingleFlight } from "./single-flight";

/** Query owns asynchronous status; a single flight covers validation plus the write. */
export function useAsyncAction<T = unknown>() {
  const flight = useRef<ReturnType<typeof createSingleFlight<T | undefined>> | null>(null);
  if (!flight.current) flight.current = createSingleFlight<T | undefined>();
  const mutation = useMutation<T, Error, () => Promise<T>>({
    mutationFn: async (action) => {
      try {
        return await action();
      } catch (error) {
        throw error instanceof Error ? error : new Error(String(error));
      }
    },
    retry: false,
    networkMode: "always",
    gcTime: 0,
  });
  const run = useCallback(
    (action: () => Promise<T>) =>
      flight.current!.run(async () => {
        try {
          return await mutation.mutateAsync(action);
        } catch {
          return undefined;
        }
      }),
    [mutation.mutateAsync],
  );
  return { ...mutation, run };
}
