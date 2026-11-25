import { describe, expect, it } from "vitest";
import type { MobileMachine } from "../remote/types";
import { learnRoutes, MAX_MACHINE_ROUTES, restoreMachines } from "./machine-model";
import { orderRoutes } from "./route-selection";
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
    providers: ["codex", "claude", "unsupported-provider"],
    capabilities: ["notes", "host.settings"],
    token: "must-not-persist",
    lastConnectedAt: 10,
  };
  it("restores machine discovery and excludes credential fields", () => {
    const [value] = restoreMachines([machine]);
    expect(value.providers).toEqual(["codex", "claude"]);
    expect(value.capabilities).toEqual(["notes", "host.settings"]);
    expect(value.lastConnectedAt).toBe(10);
    expect(value).not.toHaveProperty("token");
  });
  it("keeps late capabilities from a Host that advertises more than 200", () => {
    const many = [...Array.from({ length: 260 }, (_, index) => `cap.${index}`), "browser.shared", "dev.servers"];
    const [value] = restoreMachines([{ ...machine, capabilities: many }]);
    expect(value.capabilities).toEqual(many);
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
  it("restores every paired route with the active one first and drops invalid ones", () => {
    const lan = { endpoint: "http://192.168.1.20:3777", lanKey: "ab".repeat(32) };
    const tailscale = { endpoint: "http://100.101.102.103:42000", lanKey: "cd".repeat(32) };
    const [restored] = restoreMachines([
      {
        id: "home",
        name: "Home",
        environmentId: "home",
        ...tailscale,
        routes: [lan, tailscale, { endpoint: "http://8.8.8.8" }, { endpoint: 4 }, lan],
      },
    ]);
    expect(restored?.endpoint).toBe(tailscale.endpoint);
    expect(restored?.routes).toEqual([tailscale, lan]);
  });
  it("caps saved routes and omits the list for a single route", () => {
    const routes = Array.from({ length: 8 }, (_, index) => ({
      endpoint: `https://host-${index}.example`,
    }));
    const [many, single] = restoreMachines([
      { id: "many", name: "Many", environmentId: "e1", endpoint: "https://host-0.example", routes },
      { id: "one", name: "One", environmentId: "e2", endpoint: "https://one.example" },
    ]);
    expect(many?.routes).toHaveLength(MAX_MACHINE_ROUTES);
    expect(single).not.toHaveProperty("routes");
  });
});

describe("public routes", () => {
  const lan = { endpoint: "http://192.168.1.20:3777", lanKey: "ab".repeat(32) };
  const tailnet = { endpoint: "http://100.101.102.103:42000", lanKey: "cd".repeat(32) };
  const pub = { endpoint: "https://phones.example.com", public: true as const };
  const machine = { id: "m", name: "M", environmentId: "e", ...lan } as MobileMachine;

  it("learns a public https route and rejects other unkeyed routes", () => {
    const routes = learnRoutes(machine, [
      pub,
      { endpoint: "https://proxy.example.com" },
      { endpoint: "http://203.0.113.9:80", public: true },
      { endpoint: "https://keyed.example.com", lanKey: "ef".repeat(32), public: true },
      { endpoint: "https://phones.example.com/path", public: true },
      { endpoint: "https://phones.example.com", public: false },
    ]);
    expect(routes).toEqual([lan, pub]);
  });

  it("keeps a saved public route and persists it through restore", () => {
    const [restored] = restoreMachines([{ ...machine, routes: [lan, pub] }]);
    expect(restored?.routes).toEqual([lan, pub]);
    expect(learnRoutes(restored!, [])).toEqual([lan, pub]);
    const [active] = restoreMachines([{ ...machine, endpoint: pub.endpoint, lanKey: undefined, public: true }]);
    expect(active?.public).toBe(true);
    expect(restoreMachines([{ ...machine, public: true }])).toEqual([]);
  });

  it("orders local network, Tailscale, then public last", () => {
    expect(orderRoutes([pub, tailnet, lan])).toEqual([lan, tailnet, pub]);
    expect(orderRoutes([pub, lan, { endpoint: "https://proxy.example.com" }])).toEqual([
      lan,
      { endpoint: "https://proxy.example.com" },
      pub,
    ]);
  });
});
