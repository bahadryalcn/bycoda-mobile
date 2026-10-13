export interface SavedMachine {
  id: string;
  name: string;
  endpoint: string;
  lanKey?: string;
  environmentId: string;
  providers: string[];
  capabilities: string[];
}
export type { LanguagePreference as Language } from "../../../src/shared/i18n/languages";
export function normalizeEndpoint(value: string) {
  const url = new URL(value.trim());
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Use a host HTTP(S) address without credentials, query or fragment.");
  if (url.pathname !== "/" && url.pathname !== "/rpc")
    throw new Error("Use the host root address (or /rpc).");
  return url.origin;
}
export function validateToken(value: string) {
  const token = value.trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new Error("Enter the 43-character device token from this computer.");
  return token;
}
export function projectKey(machineId: string, projectId: string) {
  return JSON.stringify([machineId, projectId]);
}
export function sanitizeMachines(value: unknown): SavedMachine[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 32).flatMap((m: unknown) => {
    if (!m || typeof m !== "object") return [];
    const v = m as Partial<SavedMachine>;
    if (
      typeof v.id !== "string" ||
      typeof v.environmentId !== "string" ||
      typeof v.name !== "string" ||
      typeof v.endpoint !== "string"
    )
      return [];
    try {
      return [
        {
          id: v.id,
          name: v.name.slice(0, 120),
          endpoint: normalizeEndpoint(v.endpoint),
          environmentId: v.environmentId,
          providers: Array.isArray(v.providers)
            ? v.providers.filter((x) => typeof x === "string")
            : [],
          capabilities: Array.isArray(v.capabilities)
            ? v.capabilities.filter((x) => typeof x === "string")
            : [],
        },
      ];
    } catch {
      return [];
    }
  });
}
