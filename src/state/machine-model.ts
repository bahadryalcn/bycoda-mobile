import type { MobileMachine } from "../remote/types";
import { normalizeHostEndpoint } from "../remote/transport";
import { REMOTE_PROVIDERS } from "../../../src/features/connections/model/protocol";

export type { LanguagePreference as MobileLanguage } from "../../../src/shared/i18n/languages";
export function validateMachine(value: unknown): MobileMachine {
  const [machine] = restoreMachines([value]);
  if (!machine) throw new Error("Invalid saved computer connection.");
  return machine;
}
export function restoreMachines(value: unknown): MobileMachine[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    if (
      typeof source.id !== "string" ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(source.id) ||
      seen.has(source.id) ||
      typeof source.name !== "string" ||
      source.name.length > 120 ||
      /[\u0000-\u001f]/.test(source.name) ||
      typeof source.endpoint !== "string" ||
      typeof source.environmentId !== "string" ||
      !source.environmentId.trim() ||
      source.environmentId.length > 200 ||
      /[\u0000-\u001f]/.test(source.environmentId)
    )
      return [];
    try {
      const endpoint = normalizeHostEndpoint(source.endpoint, source.lanKey as string | undefined);
      seen.add(source.id);
      return [
        {
          id: source.id,
          name: source.name,
          endpoint,
          ...(source.lanKey !== undefined ? { lanKey: source.lanKey as string } : {}),
          environmentId: source.environmentId,
          providers: Array.isArray(source.providers)
            ? source.providers.filter((v): v is (typeof REMOTE_PROVIDERS)[number] =>
                REMOTE_PROVIDERS.includes(v),
              )
            : undefined,
          capabilities: Array.isArray(source.capabilities)
            ? source.capabilities
                .filter((v): v is string => typeof v === "string" && v.length <= 200)
                .slice(0, 200)
            : undefined,
          lastConnectedAt:
            typeof source.lastConnectedAt === "number" && Number.isFinite(source.lastConnectedAt)
              ? source.lastConnectedAt
              : undefined,
          platform: ["win32", "darwin", "linux"].includes(String(source.platform))
            ? (source.platform as MobileMachine["platform"])
            : undefined,
        },
      ];
    } catch {
      return [];
    }
  });
}
