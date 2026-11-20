import type { HostModelCatalog, RemoteProvider } from "@/domain/types";

export function validAgentRunMinutes(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) <= 10_080;
}

export function effectiveAgentModel(
  model: string,
  harness: RemoteProvider,
  catalog?: HostModelCatalog,
): string {
  return model || catalog?.models[harness]?.[0]?.id || "";
}
