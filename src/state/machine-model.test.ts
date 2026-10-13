import { describe, expect, it } from "vitest";
import { restoreMachines } from "./machine-model";
describe("saved remote computers", () => {
  it("restores pinned LAN metadata and rejects unpinned or public HTTP", () => {
    const lan = {
      id: "lan",
      name: "Home",
      environmentId: "home",
      endpoint: "http://192.168.1.20:3777",
      lanKey: "ab".repeat(32),
    };
    expect(restoreMachines([lan])[0]).toMatchObject(lan);
    expect(
      restoreMachines([
        { ...lan, lanKey: undefined },
        { ...lan, endpoint: "http://8.8.8.8" },
        { ...lan, lanKey: "00".repeat(32) },
      ]),
    ).toEqual([]);
  });
  const machine = {
    id: "machine-one",
    name: "Work PC",
    endpoint: "https://work.example",
    environmentId: "env-one",
    providers: ["gemini", "claude"],
    capabilities: ["notes", "host.settings"],
    token: "must-not-persist",
    lastConnectedAt: 10,
  };
  it("restores machine discovery and excludes credential fields", () => {
    const [value] = restoreMachines([machine]);
    expect(value.providers).toEqual(["gemini", "claude"]);
    expect(value.capabilities).toEqual(["notes", "host.settings"]);
    expect(value.lastConnectedAt).toBe(10);
    expect(value).not.toHaveProperty("token");
  });
  it("rejects insecure remote URLs and embedded credentials", () => {
    expect(
      restoreMachines([
        { ...machine, endpoint: "http://remote.example" },
        { ...machine, endpoint: "https://token@work.example" },
      ]),
    ).toEqual([]);
  });
  it("deduplicates IDs and allows loopback development hosts", () => {
    expect(restoreMachines([machine, machine])).toHaveLength(1);
    expect(restoreMachines([{ ...machine, endpoint: "http://127.0.0.1:3774" }])[0].endpoint).toBe(
      "http://127.0.0.1:3774",
    );
  });
  it("rejects blank identities, unsafe secure-store IDs and control characters", () => {
    expect(
      restoreMachines([
        { ...machine, id: "../other" },
        { ...machine, environmentId: " " },
        { ...machine, name: "PC\nsecret" },
      ]),
    ).toEqual([]);
  });
});
