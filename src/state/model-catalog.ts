import type { HostModelCatalog } from "@/domain/types";
import { useHostQuery } from "./queries";

/** A settled catalog only changes when accounts or providers change on the computer. */
export const SETTLED_CATALOG_REFRESH_MS = 60_000;

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
      // Fast only while providers are still arriving; a settled catalog barely changes, so a slow
      // safety refresh is enough. The model sheet refetches when it opens.
      interval: (catalog) => (catalog?.pending?.length ? 1000 : SETTLED_CATALOG_REFRESH_MS),
    },
  );
}
