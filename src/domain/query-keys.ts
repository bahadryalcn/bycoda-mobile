export const machineQueryKey = (machineId: string, ...parts: readonly unknown[]) =>
  ["host", machineId, ...parts] as const;
