import type { HostModelCatalog, RemoteProvider } from "@/domain/types";

export function effectiveAgentModel(
  model: string,
  harness: RemoteProvider,
  catalog?: HostModelCatalog,
): string {
  return model || catalog?.models[harness]?.[0]?.id || "";
}
