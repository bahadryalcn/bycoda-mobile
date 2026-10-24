import { expect, it } from "vitest";
import { metadataPatch, readProviderCenter } from "./provider-center-model";
const agent = { id: "fixture", name: "Agent", argumentCount: 2, environmentKeyCount: 1, contextWindow: 64000 };
const report = () => ({ environmentId: "host", sampledAt: 42, providers: [{ id: "claude", label: "Claude", launcher: "resolved", accountState: "desktop-only" }], acp: { revision: "a".repeat(64), agents: [agent] } });
it("accepts only the safe host projection and rejects raw config before caching", () => {
  expect(readProviderCenter(report(), "host")).toEqual(report());
  for (const secret of ["command", "args", "env", "envKeys", "authMethodId"])
    expect(() => readProviderCenter({ ...report(), acp: { ...report().acp, agents: [{ ...agent, [secret]: "private" }] } }, "host")).toThrow("Invalid safe");
  expect(() => readProviderCenter({ ...report(), rawConfig: "private" }, "host")).toThrow();
});
it("rejects wrong host, duplicate identities, excess config counts and invalid metrics", () => {
  expect(() => readProviderCenter(report(), "other")).toThrow();
  expect(() => readProviderCenter({ ...report(), acp: { ...report().acp, agents: [agent, agent] } }, "host")).toThrow();
  expect(() => readProviderCenter({ ...report(), acp: { ...report().acp, agents: Array(257).fill(agent) } }, "host")).toThrow();
  expect(() => readProviderCenter({ ...report(), acp: { ...report().acp, agents: [{ ...agent, argumentCount: 65 }] } }, "host")).toThrow();
  expect(() => readProviderCenter({ ...report(), providers: [{ ...report().providers[0], launcher: "authenticated" }] }, "host")).toThrow();
});
it("builds metadata-only patch with opaque revision and explicit context removal", () => {
  expect(metadataPatch(agent, "a".repeat(64), " Renamed ", "")).toEqual({ id: "fixture", expectedRevision: "a".repeat(64), name: "Renamed", contextWindow: null });
  for (const context of ["1023", "10000001", "12x", "1e5"]) expect(() => metadataPatch(agent, "a".repeat(64), "Name", context)).toThrow();
});
