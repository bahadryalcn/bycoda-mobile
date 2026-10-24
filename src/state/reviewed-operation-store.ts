export type ReviewedOperationAttempt = {
  operationId: string;
  environmentId: string;
  digest: string;
  targetIdentityDigest?: string;
};
export type ReviewedOperationStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
};
const locks = new Map<string, Promise<unknown>>();
export function reviewedOperationStore(
  storage: ReviewedOperationStorage,
  key: string,
  invalidMessage = "Invalid saved operation receipt",
) {
  const load = async (): Promise<ReviewedOperationAttempt | null> => {
    const raw = await storage.getItem(key);
    if (!raw) return null;
    if (raw.length > 1024) throw new Error(invalidMessage);
    const value = JSON.parse(raw) as ReviewedOperationAttempt;
    if (
      !value ||
      Object.keys(value).some(
        (field) =>
          !["operationId", "environmentId", "digest", "targetIdentityDigest"].includes(field),
      ) ||
      typeof value.operationId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(value.operationId) ||
      typeof value.environmentId !== "string" ||
      !value.environmentId ||
      value.environmentId.length > 256 ||
      typeof value.digest !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.digest) ||
      (value.targetIdentityDigest !== undefined &&
        (typeof value.targetIdentityDigest !== "string" ||
          !/^[a-f0-9]{64}$/.test(value.targetIdentityDigest)))
    )
      throw new Error(invalidMessage);
    return value;
  };
  const serialized = async <T>(action: () => Promise<T>) => {
    const previous = locks.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(action);
    locks.set(key, pending);
    try {
      return await pending;
    } finally {
      if (locks.get(key) === pending) locks.delete(key);
    }
  };
  return {
    load,
    claim: (attempt: ReviewedOperationAttempt) =>
      serialized(async () => {
        const previous = await load();
        if (previous) return { attempt: previous, claimed: false };
        await storage.setItem(key, JSON.stringify(attempt));
        return { attempt, claimed: true };
      }),
    clear: (operationId: string) =>
      serialized(async () => {
        if ((await load())?.operationId === operationId) await storage.removeItem(key);
      }),
  };
}
