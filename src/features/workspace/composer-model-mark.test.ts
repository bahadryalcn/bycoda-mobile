import { expect, it, vi } from "vitest";
import { ComposerModelMark } from "./composer-model-mark";
import { ProviderAccountMark } from "@/ui/agent-avatar";
import type { HostSession } from "./wire";

vi.mock("@/state/model-catalog", () => ({
  useModelCatalog: () => ({ data: { accounts: { codex: [{ id: "work", label: "Work account", kind: "work", color: "account-color" }] } } }),
}));
vi.mock("@/ui/agent-avatar", () => ({ ProviderAccountMark: () => null }));

it("keeps only provider identity and account color beside the composer model", () => {
  const mark = ComposerModelMark({ session: { projectId: "project", session: {
    harness: "codex", providerAccountId: "work",
  } } as unknown as HostSession });
  expect(mark.type).toBe(ProviderAccountMark);
  expect(mark.props).toEqual({ provider: "codex", color: "account-color", size: 16 });
});
