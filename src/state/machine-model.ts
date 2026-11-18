import type { MobileMachine, MobileRoute } from "../remote/types";
import { normalizeHostEndpoint } from "../remote/transport";
import { REMOTE_PROVIDERS } from "../../../src/features/connections/model/protocol";

export type { LanguagePreference as MobileLanguage } from "../../../src/shared/i18n/languages";
export function validateMachine(value: unknown): MobileMachine {
  const [machine] = restoreMachines([value]);
  if (!machine) throw new Error("Invalid saved computer connection.");
  return machine;
}
export const MAX_MACHINE_ROUTES = 4;
export const sameRoute = (a: MobileRoute, b: MobileRoute) =>
  a.endpoint === b.endpoint && a.lanKey === b.lanKey;

/**
 * Validates saved routes, keeps the active one first and drops duplicates or
 * malformed entries. An invalid stored route never invalidates the computer.
 */
export function mergeRoutes(active: MobileRoute, ...others: (MobileRoute[] | undefined)[]) {
  const routes: MobileRoute[] = [active];
  for (const list of others)
    for (const item of list ?? []) {
      if (routes.length >= MAX_MACHINE_ROUTES) break;
      if (!item || typeof item !== "object" || typeof item.endpoint !== "string") continue;
      if (item.lanKey !== undefined && typeof item.lanKey !== "string") continue;
      let route: MobileRoute;
      try {
        route = {
          endpoint: normalizeHostEndpoint(item.endpoint, item.lanKey),
          ...(item.lanKey !== undefined ? { lanKey: item.lanKey } : {}),
        };
      } catch {
        continue;
      }
      if (!routes.some((known) => sameRoute(known, route))) routes.push(route);
    }
  return routes;
}

/**
 * The routes of a saved computer after its Host reported the ones it serves
 * now, so a phone paired over one route learns the others without pairing
 * again. The active route stays first. A reported local listener replaces a
 * saved one with the same key at another address (its DHCP address changed);
 * other saved routes stay. Undefined when the Host reports nothing (older Host).
 */
export function learnRoutes(machine: MobileMachine, reported: unknown): MobileRoute[] | undefined {
  if (!Array.isArray(reported)) return undefined;
  const active: MobileRoute = {
    endpoint: machine.endpoint,
    ...(machine.lanKey !== undefined ? { lanKey: machine.lanKey } : {}),
  };
  const fresh = mergeRoutes(active, reported as MobileRoute[]).slice(1);
  const moved = (route: MobileRoute) =>
    fresh.some((known) => known.lanKey && known.lanKey === route.lanKey && !sameRoute(known, route));
  return mergeRoutes(
    active,
    fresh,
    (machine.routes ?? []).filter((route) => !moved(route)),
  );
}

/** The Host advertises more than 200 capabilities; a lower cap silently dropped the late ones (browser.shared, dev.servers, ...). */
export const MAX_CAPABILITIES = 1000;

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
      const active: MobileRoute = {
        endpoint,
        ...(source.lanKey !== undefined ? { lanKey: source.lanKey as string } : {}),
      };
      const routes = mergeRoutes(
        active,
        Array.isArray(source.routes) ? (source.routes as MobileRoute[]) : undefined,
      );
      seen.add(source.id);
      return [
        {
          id: source.id,
          name: source.name,
          endpoint,
          ...(source.lanKey !== undefined ? { lanKey: source.lanKey as string } : {}),
          ...(routes.length > 1 ? { routes } : {}),
          environmentId: source.environmentId,
          providers: Array.isArray(source.providers)
            ? source.providers.filter((v): v is (typeof REMOTE_PROVIDERS)[number] =>
                REMOTE_PROVIDERS.includes(v),
              )
            : undefined,
          capabilities: Array.isArray(source.capabilities)
            ? source.capabilities
                .filter((v): v is string => typeof v === "string" && v.length <= 200)
                .slice(0, MAX_CAPABILITIES)
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
