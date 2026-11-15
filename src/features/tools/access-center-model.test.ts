import { expect, it } from "vitest";
import { deviceRevokeIntent, localTunnelUrl, readAccessCenter, visibleAccessDevices } from "./access-center-model";
const report = () => ({ environmentId: "host", sampledAt: 42, devices: [{ id: "current", name: "Phone", isCurrent: true }], devicesTruncated: false,
  lan: { state: "ready" }, privateNetwork: { state: "offline" }, tunnels: { providers: [{ provider: "cloudflare", installed: true, credential: "not-required" }],
    tunnels: [{ id: "tunnel", provider: "cloudflare", target: "host", state: "ready", startedAt: 42, localUrl: "http://127.0.0.1:3000", publicUrl: "https://fixture.trycloudflare.com", canStop: true }], publicReachability: "unverified" } });
it("finds paired devices by localized name or identity and preserves report order", () => {
  const devices = [{ id: "first-abcd", name: "İş telefonu", isCurrent: false },
    { id: "current-efgh", name: "İş telefonu", isCurrent: true },
    { id: "last-ijkl", name: "Tablet", isCurrent: false }];
  expect(visibleAccessDevices(devices, " iş ", "tr").map(device => device.id)).toEqual(["current-efgh", "first-abcd"]);
  expect(visibleAccessDevices(devices, "IJKL", "en")).toEqual([devices[2]]);
  expect(visibleAccessDevices(devices, "missing", "tr")).toEqual([]);
  expect(visibleAccessDevices(devices, "").map(device => device.id)).toEqual(["current-efgh", "first-abcd", "last-ijkl"]);
  expect(devices.map(device => device.id)).toEqual(["first-abcd", "current-efgh", "last-ijkl"]);
});
it("validates only safe projected metadata and rejects credentials or wrong host before caching", () => {
  expect(readAccessCenter(report(), "host")).toEqual(report());
  expect(() => readAccessCenter(report(), "other")).toThrow();
  for (const field of ["token", "hash", "ticket"]) expect(() => readAccessCenter({ ...report(), devices: [{ ...report().devices[0], [field]: "private" }] }, "host")).toThrow();
  expect(() => readAccessCenter({ ...report(), lan: { state: "ready", lanKey: "private" } }, "host")).toThrow();
  expect(() => readAccessCenter({ ...report(), tunnels: { ...report().tunnels, tunnels: [{ ...report().tunnels.tunnels[0], publicUrl: "https://user:password@fixture.trycloudflare.com" }] } }, "host")).toThrow();
});
it("keeps self and other revoke methods distinct and accepts only safe host-loopback tunnel origins", () => {
  expect(deviceRevokeIntent({ id: "current", name: "Phone", isCurrent: true })).toEqual({ method: "devices.revokeSelf", params: {} });
  expect(deviceRevokeIntent({ id: "other", name: "Other", isCurrent: false })).toEqual({ method: "devices.revokeOther", params: { id: "other" } });
  expect(localTunnelUrl("http://localhost:3000")).toBe("http://localhost:3000");
  for (const url of ["https://example.com", "http://user:password@localhost:3000", "http://localhost:3000/?token=private", "file:///source"])
    expect(() => localTunnelUrl(url)).toThrow();
});
