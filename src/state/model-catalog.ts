import type { HostModelCatalog } from "@/domain/types";
import { useHostQuery } from "./queries";

/** New hosts return available providers immediately; old hosts ignore the hint. */
export function useModelCatalog(projectId: string, enabled = true) {
  return useHostQuery<HostModelCatalog>(
    ["models", projectId],
    "models.list",
    {
      projectId,
      progressive: true,
    },
    {
      enabled,
      interval: (catalog) => (catalog?.pending?.length ? 1000 : 5000),
    },
  );
}
