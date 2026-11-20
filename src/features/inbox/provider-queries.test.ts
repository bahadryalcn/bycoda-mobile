import { expect, it, vi } from "vitest";
import { useProviderInboxAvailability } from "./provider-queries";

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/state/machines", () => ({}));
vi.mock("@/state/queries", () => ({ useHostQuery: read }));
vi.mock("./provider-jobs", () => ({}));

it("shares availability by computer and avoids frequent polling while the provider is available", () => {
  useProviderInboxAvailability();
  expect(read).toHaveBeenCalledOnce();
  const [key, method, params, options] = read.mock.calls[0]!;
  expect([key, method, params]).toEqual([["provider-inbox", "availability"], "inbox.provider.status", {}]);
  expect(options.interval).toBe(60_000);
});
