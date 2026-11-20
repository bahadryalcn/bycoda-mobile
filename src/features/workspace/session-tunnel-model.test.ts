import { describe, expect, it } from "vitest";
import type { DevServer } from "../tools/types";
import {
  chooseTunnelOpening,
  resolveTunnelTarget,
  tunnelDisplayUrl,
  tunnelPageUrl,
} from "./session-tunnel-model";

const server = (over: Partial<DevServer> & { port?: number; address?: string } = {}): DevServer => ({
  id: over.id ?? "srv-1",
  process: "process" in over ? over.process : { pid: 4321, startedAt: "2026-11-19T10:00:00Z", name: "node" },
  endpoints: over.endpoints ?? [{ address: over.address ?? "127.0.0.1", port: over.port ?? 3000, url: `http://127.0.0.1:${over.port ?? 3000}` }],
  managed: true,
  state: "running",
  name: "web",
  projectId: "projectId" in over ? over.projectId : "p1",
  association: over.association ?? "managed",
  logsAvailable: true,
});
const resolve = (href: string, servers: DevServer[]) => resolveTunnelTarget({ href, projectId: "p1", servers });

describe("resolveTunnelTarget", () => {
  it("resolves one owning process with identity, address and path", () => {
    expect(resolve("http://localhost:3000/app?x=1#top", [server()])).toEqual({
      ok: true,
      value: {
        target: { projectId: "p1", id: "srv-1", pid: 4321, startedAt: "2026-11-19T10:00:00Z", port: 3000, address: "127.0.0.1" },
        path: "/app?x=1#top",
      },
    });
  });
  it("treats duplicate listeners of one process as one and prefers the 127.* address", () => {
    const both = server({ endpoints: [
      { address: "::1", port: 3000, url: "http://[::1]:3000" },
      { address: "127.0.0.1", port: 3000, url: "http://127.0.0.1:3000" },
    ] });
    const result = resolve("http://localhost:3000", [both]);
    expect(result.ok && result.value.target.address).toBe("127.0.0.1");
  });
  it("refuses none, ambiguous, https, foreign project, uncertain and identity-less servers", () => {
    expect(resolve("http://localhost:3001/", [server()])).toEqual({ ok: false, reason: "none" });
    expect(resolve("http://localhost:3000/", [server({ id: "a" }), server({ id: "b" })])).toEqual({ ok: false, reason: "ambiguous" });
    expect(resolve("https://localhost:3000/", [server()])).toEqual({ ok: false, reason: "https" });
    expect(resolve("http://localhost:3000/", [server({ projectId: "other" })])).toEqual({ ok: false, reason: "none" });
    expect(resolve("http://localhost:3000/", [server({ association: "uncertain" })])).toEqual({ ok: false, reason: "none" });
    expect(resolve("http://localhost:3000/", [server({ process: undefined })])).toEqual({ ok: false, reason: "identity" });
    expect(resolve("http://localhost:3000/", [server({ process: { pid: 0, startedAt: "x", name: "n" } })])).toEqual({ ok: false, reason: "identity" });
  });
  it("refuses non-loopback, credentialed and malformed links", () => {
    expect(resolve("http://example.com:3000/", [server()])).toEqual({ ok: false, reason: "invalid" });
    expect(resolve("http://user:pw@localhost:3000/", [server()])).toEqual({ ok: false, reason: "invalid" });
    expect(resolve("not a url", [server()])).toEqual({ ok: false, reason: "invalid" });
  });
  it("does not match a server listening on a non-loopback address", () => {
    expect(resolve("http://localhost:3000/", [server({ address: "192.168.1.5" })])).toEqual({ ok: false, reason: "none" });
  });
});

describe("chooseTunnelOpening", () => {
  it("opens on the phone only with the Host capability and native support", () => {
    expect(chooseTunnelOpening({ capabilities: ["dev.servers.tunnel.v1"], supported: true })).toBe("tunnel");
    expect(chooseTunnelOpening({ capabilities: ["dev.servers.tunnel.v1"], supported: false })).toBe("host");
    expect(chooseTunnelOpening({ capabilities: ["browser.shared"], supported: true })).toBe("host");
    expect(chooseTunnelOpening({ capabilities: undefined, supported: true })).toBe("host");
  });
});

describe("tunnel addresses", () => {
  it("shows the localhost form and never the alias", () => {
    const alias = "b0123456789abcdef0123456789abcdef.test";
    const url = tunnelPageUrl(alias, 3000, "/a?b=1#c");
    expect(url).toBe(`http://${alias}:3000/a?b=1#c`);
    expect(tunnelDisplayUrl(url, alias, 3000)).toBe("http://localhost:3000/a?b=1#c");
    expect(tunnelDisplayUrl("http://example.com/x", alias, 3000)).toBe("http://example.com/x");
  });
});
