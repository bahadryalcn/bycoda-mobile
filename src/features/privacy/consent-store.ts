export const consentKey = "bycoda.mobile.provider-consent.v1";
export const consentVersion = "2026-10-11";

type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

/** Consent covers the selected computer and its advertised provider set. */
export function consentScope(environmentId: string, providers: readonly string[]) {
  return JSON.stringify([environmentId, [...new Set(providers)].sort()]);
}

/**
 * Consent given for a provider set also covers any subset of it on the same computer.
 * Hosts report narrower lists on some transports (HTTP vs socket), and a narrower
 * list shares data with fewer parties; only a provider never consented asks again.
 */
export function consentCovers(granted: string, wanted: string): boolean {
  if (granted === wanted) return true;
  try {
    const [grantedEnv, grantedProviders] = JSON.parse(granted) as [unknown, unknown];
    const [wantedEnv, wantedProviders] = JSON.parse(wanted) as [unknown, unknown];
    return (
      typeof grantedEnv === "string" &&
      grantedEnv === wantedEnv &&
      Array.isArray(grantedProviders) &&
      Array.isArray(wantedProviders) &&
      wantedProviders.every((provider) => grantedProviders.includes(provider))
    );
  } catch {
    return false;
  }
}

function decode(raw: string | null): string[] {
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Consent could not be read.");
  const record = value as { version?: unknown; scopes?: unknown };
  if (record.version !== consentVersion) return [];
  if (!Array.isArray(record.scopes) || record.scopes.some((scope) => typeof scope !== "string"))
    throw new Error("Consent could not be read.");
  return record.scopes as string[];
}

export function createConsentStore(storage: Storage) {
  let pending = Promise.resolve();
  function enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = pending.catch(() => undefined).then(action);
    pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  return {
    allows: (scope: string) =>
      enqueue(async () => decode(await storage.getItem(consentKey)).some((granted) =>
          consentCovers(granted, scope),
        )),
    allow: (scope: string) =>
      enqueue(async () => {
        const scopes = decode(await storage.getItem(consentKey));
        await storage.setItem(
          consentKey,
          JSON.stringify({
            version: consentVersion,
            scopes: [...new Set([...scopes, scope])],
          }),
        );
      }),
    revoke: () =>
      enqueue(async () => {
        await storage.removeItem(consentKey);
      }),
  };
}
