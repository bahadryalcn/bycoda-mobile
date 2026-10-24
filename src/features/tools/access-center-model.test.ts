import { expect, it } from "vitest";
import { deviceRevokeIntent, localTunnelUrl, readAccessCenter } from "./access-center-model";
const report = () => ({ environmentId: "host", sampledAt: 42, devices: [{ id: "current", name: "Phone", isCurrent: true }], devicesTruncated: false,
  lan: { state: "ready" }, privateNetwork: { state: "offline" }, tunnels: { providers: [{ provider: "cloudflare", installed: true, credential: "not-required" }],
    tunnels: [{ id: "tunnel", provider: "cloudflare", target: "host", state: "ready", startedAt: 42, localUrl: "http://127.0.0.1:3000", publicUrl: "https://fixture.trycloudflare.com", canStop: true }], publicReachability: "unverified" } });
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
