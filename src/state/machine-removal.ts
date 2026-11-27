import type { QueryClient } from "@tanstack/react-query";
import { useMachines } from "./machines";

type Expected = Parameters<ReturnType<typeof useMachines.getState>["removeMachine"]>[1];

/**
 * Removes a saved computer and, once it is gone, every cached read of it: private Host data must
 * not stay in memory for the cache lifetime after the computer was removed. Every removal path
 * (Computers, consent withdrawal, local data cleanup) goes through here.
 */
export async function removeMachineAndQueries(
  cache: Pick<QueryClient, "removeQueries"> | undefined,
  id: string,
  expected?: Expected,
) {
  await useMachines.getState().removeMachine(id, expected);
  if (!useMachines.getState().machines.some((machine) => machine.id === id))
    cache?.removeQueries({ queryKey: ["machine", id] });
}
