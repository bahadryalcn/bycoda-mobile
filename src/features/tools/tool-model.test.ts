import { describe, expect, it } from "vitest";
import { expectedPort, projectServers, serverTarget } from "./tool-model";
import type { DevServer } from "./types";

const server = (fields: Partial<DevServer> = {}): DevServer => ({
  id: "server", projectId: "project", name: "App", managed: true, association: "managed",
  endpoints: [], state: "running", logsAvailable: true,
  process: { pid: 123, startedAt: "birth-123", name: "node" }, ...fields,
});

describe("mobile project host tools", () => {
  it("does not expose another project's or uncertain server discovery", () => {
    expect(projectServers([
      server(), server({ id: "other", projectId: "other" }),
      server({ id: "unknown", association: "uncertain" }), server({ id: "unscoped", projectId: undefined }),
    ], "project").map((value) => value.id)).toEqual(["server"]);
  });

  it("freezes process birth identity and refuses incomplete or foreign targets", () => {
    expect(serverTarget(server(), "project", true)).toEqual({
      id: "server", projectId: "project", tree: true, identity: { pid: 123, startedAt: "birth-123" },
    });
    expect(() => serverTarget(server({ process: { pid: 123, startedAt: "", name: "node" } }), "project", false)).toThrow();
    expect(() => serverTarget(server(), "other", false)).toThrow();
    expect(() => serverTarget(server({ process: undefined, managed: false }), "project", false)).toThrow();
  });

  it("allows an omitted port but rejects fractional, zero and out-of-range values", () => {
    expect(expectedPort("")).toBeUndefined();
    expect(expectedPort("8081")).toBe(8081);
    for (const value of ["0", "65536", "1.5", "1e3", "abc"])
      expect(() => expectedPort(value)).toThrow();
  });
});
