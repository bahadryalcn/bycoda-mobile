import { expect, it, vi } from "vitest";
import { usePolicy } from "./policy";

const fixture = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/state/queries", () => ({ useHostQuery: (...args: unknown[]) => fixture.query(...args) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => ({ Body: () => null, Disclosure: () => null }));

it("keeps the existing policy route and guards scoped reads before and after transport", async () => {
  usePolicy("account");
  expect(fixture.query.mock.lastCall).toEqual([["social", "policy", "account"], "social.request", { action: "policy.get", input: { accountId: "account" } }, undefined]);
  let allowed = true;
  const assert = vi.fn(() => { if (!allowed) throw new Error("Connection changed"); });
  usePolicy("account", { key: "opaque-token", enabled: false, assert });
  const call = fixture.query.mock.lastCall!;
  expect(call[0]).toEqual(["social", "policy", "account", "opaque-token"]);
  expect(call[3].enabled).toBe(false);
  const queryFn = call[3].queryFn;
  const signal = new AbortController().signal;
  const request = vi.fn(async () => ({ effective: {} }));
  await expect(queryFn({ request }, signal)).resolves.toEqual({ effective: {} });
  expect(assert).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenCalledWith("social.request", { action: "policy.get", input: { accountId: "account" } }, { signal });
  allowed = false;
  request.mockClear();
  await expect(queryFn({ request }, signal)).rejects.toThrow("Connection changed");
  expect(request).not.toHaveBeenCalled();
  allowed = true;
  request.mockImplementation(async () => { allowed = false; return { effective: {} }; });
  await expect(queryFn({ request }, signal)).rejects.toThrow("Connection changed");
});
