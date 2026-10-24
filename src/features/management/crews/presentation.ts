import type { CrewRole } from "@/remote/contracts/crews";
import type { HostModelCatalog } from "@/domain/types";

export type CrewCopy = (tr: string, en: string) => string;
export function crewRoleOptions(copy: CrewCopy) {
  return [
    { value: "coordinator" as CrewRole, label: copy("Koordinatör", "Coordinator") },
    { value: "specialist" as CrewRole, label: copy("Uzman", "Specialist") },
    { value: "reviewer" as CrewRole, label: copy("İnceleyen", "Reviewer") },
    { value: "advisor" as CrewRole, label: copy("Danışman", "Advisor") },
  ];
}

export type CrewCatalogState = "loading" | "error" | "empty" | "ready";
export type CrewCatalogRead = { state: CrewCatalogState; retry?: () => void };

/** Cached options stay usable during refresh; read feedback never rewrites them. */
export function crewCatalogState(
  catalog: HostModelCatalog | undefined,
  error: unknown,
): CrewCatalogState {
  if (error) return "error";
  if (!catalog) return "loading";
  if (Object.values(catalog.models ?? {}).some((rows) => !!rows?.length)) return "ready";
  if (catalog.pending?.length) return "loading";
  if (Object.values(catalog.errors ?? {}).some(Boolean)) return "error";
  return "empty";
}
