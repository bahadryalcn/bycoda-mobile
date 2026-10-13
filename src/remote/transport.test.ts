import { beforeEach, describe, expect, it, vi } from "vitest";
const access = vi.hoisted(() => ({ locked: false }));
vi.mock("../state/security", () => ({
  assertAppAccess() {
    if (access.locked) throw new Error("App is locked.");
  },
}));
import { discoverMachine, HostTransport, normalizeHostEndpoint } from "./transport";
import type { HostDescriptor, MobileMachine } from "./types";

const credential = "a".repeat(43);
const machine: MobileMachine = {
  id: "pc-1",
  name: "Work PC",
  endpoint: "https://pc.example",
  environmentId: "env-1",
};
const descriptor: HostDescriptor = {
  protocolVersion: 1,
  environmentId: "env-1",
  name: "Work PC",
  providers: ["codex"],
  capabilities: ["sessions"],
  platform: "win32",
};
const result = (value: unknown) =>
  new Response(JSON.stringify({ result: value }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("mobile host transport", () => {
  beforeEach(() => {
    access.locked = false;
  });
  it("accepts HTTPS origins and only loopback HTTP without embedded credentials", () => {
    expect(normalizeHostEndpoint(" https://pc.example/ ")).toBe("https://pc.example");
    expect(normalizeHostEndpoint("http://127.0.0.1:3774")).toBe("http://127.0.0.1:3774");
    for (const address of [
      "http://100.64.1.2:3774",
      "https://user:pass@pc.example",
      "https://pc.example/rpc",
      "https://pc.example/?token=secret",
      "https://pc.example/#secret",
    ])
      expect(() => normalizeHostEndpoint(address)).toThrow();
  });

  it("pins every ordinary request to a machine identity and keeps credentials in headers", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(result([]));
    const transport = new HostTransport(machine, async () => credential, fetcher);
    await transport.request("projects.list");
    const [address, init] = fetcher.mock.calls[0];
    expect(address).toBe("https://pc.example/rpc");
    expect(JSON.parse(String(init?.body))).toEqual({
      version: 1,
      environmentId: "env-1",
      method: "projects.list",
      params: {},
    });
    expect(init?.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: `Bearer ${credential}`,
    });
    expect(init?.redirect).toBe("error");
    expect(init?.credentials).toBe("omit");
    expect(JSON.stringify(machine)).not.toContain(credential);
  });

  it("calls the default native fetch with its global receiver", async () => {
    const fetcher = vi.fn(function (this: unknown, ..._args: Parameters<typeof fetch>) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(result([]));
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      await expect(
        new HostTransport(machine, async () => credential).request("projects.list"),
      ).resolves.toEqual([]);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][0]).toBe("https://pc.example/rpc");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("discovers the actual authenticated environment without an existing identity", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(result(descriptor));
    expect(
      await discoverMachine(machine.endpoint, credential, {
        fetchImpl: fetcher,
      }),
    ).toEqual(descriptor);
    const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(payload.method).toBe("environment.describe");
    expect(payload.environmentId).toBeUndefined();
    expect(payload.params.supportedProviders).toContain("acp");
  });

  it("does not send a transient pairing credential while the app is locked", async () => {
    access.locked = true;
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      discoverMachine(machine.endpoint, credential, { fetchImpl: fetcher }),
    ).rejects.toMatchObject({ kind: "auth" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("checks access after an asynchronous transient credential read", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const read = async () => {
      access.locked = true;
      return credential;
    };
    const guard = () => {
      if (access.locked) throw new Error("App is locked.");
    };
    await expect(new HostTransport(machine, read, fetcher, guard).describe()).rejects.toMatchObject(
      { kind: "auth" },
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("blocks a captured write client when the app locks during a deferred credential read", async () => {
    const fetcher = vi.fn<typeof fetch>();
    let finishRead!: (value: string) => void;
    const read = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finishRead = resolve;
        }),
    );
    const guard = () => {
      if (access.locked) throw new Error("App is locked.");
    };
    const request = new HostTransport(machine, read, fetcher, guard).request("files.write");
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    access.locked = true;
    finishRead(credential);
    await expect(request).rejects.toMatchObject({
      kind: "auth",
      uncertain: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["projects.list", false],
    ["files.write", true],
  ])(
    "rejects a deferred %s response after access loss with uncertainty %s",
    async (method, uncertain) => {
      let finishResponse!: (value: Response) => void;
      const fetcher = vi.fn<typeof fetch>(
        () =>
          new Promise<Response>((resolve) => {
            finishResponse = resolve;
          }),
      );
      const guard = () => {
        if (access.locked) throw new Error("App is locked.");
      };
      const request = new HostTransport(machine, async () => credential, fetcher, guard).request(
        method,
        {},
        { retry: true },
      );
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
      access.locked = true;
      finishResponse(result({ privateHostResult: "private host content" }));
      const error = await request.catch((value) => value);
      expect(error).toMatchObject({ kind: "auth", uncertain });
      expect(String(error)).not.toContain("private host content");
      if (uncertain) expect(String(error)).toContain("check the result before retrying");
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("does not repeat pairing after the app locks during the first network attempt", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      access.locked = true;
      throw new TypeError("Offline");
    });
    await expect(
      discoverMachine(machine.endpoint, credential, { fetchImpl: fetcher }),
    ).rejects.toMatchObject({ kind: "auth" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not hand a completed pairing result to a screen that has locked", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      access.locked = true;
      return result(descriptor);
    });
    await expect(
      discoverMachine(machine.endpoint, credential, { fetchImpl: fetcher }),
    ).rejects.toMatchObject({ kind: "auth" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("requires explicit re-pairing when an address changes host identity", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(result({ ...descriptor, environmentId: "other-host" }));
    await expect(
      new HostTransport(machine, async () => credential, fetcher).describe(),
    ).rejects.toMatchObject({ machineId: "pc-1", kind: "identity" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("pins identity for generic health queries as well as describe helpers", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(result({ ...descriptor, environmentId: "other-host" }));
    await expect(
      new HostTransport(machine, async () => credential, fetcher).request("environment.describe"),
    ).rejects.toMatchObject({ machineId: "pc-1", kind: "identity" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries a read once and never automatically replays an uncertain write", async () => {
    const readFetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(result([]));
    await expect(
      new HostTransport(machine, async () => credential, readFetcher).request("projects.list"),
    ).resolves.toEqual([]);
    expect(readFetcher).toHaveBeenCalledTimes(2);
    const writeFetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    await expect(
      new HostTransport(machine, async () => credential, writeFetcher).request(
        "commands.dispatch",
        { type: "send" },
        { retry: true },
      ),
    ).rejects.toMatchObject({ kind: "network", uncertain: true });
    expect(writeFetcher).toHaveBeenCalledTimes(1);
  });

  it("does not retry revoked credentials and stops before sending missing credentials", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ error: "invalid" }), { status: 401 }));
    await expect(
      new HostTransport(machine, async () => credential, fetcher).request("projects.list"),
    ).rejects.toMatchObject({ kind: "auth", uncertain: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(
      new HostTransport(machine, async () => null, fetcher).request("commands.dispatch"),
    ).rejects.toMatchObject({ kind: "auth", uncertain: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("cancels inactive screen requests before contacting the computer", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      new HostTransport(machine, async () => credential, fetcher).request(
        "projects.list",
        {},
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ kind: "aborted" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("bounds host responses and never displays a credential echoed in a rejection", async () => {
    const oversized = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", {
        headers: { "Content-Length": String(17 * 1024 * 1024) },
      }),
    );
    await expect(
      new HostTransport(machine, async () => credential, oversized).request("projects.list"),
    ).rejects.toMatchObject({ kind: "protocol" });
    const echo = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: `Rejected Bearer ${credential}, token=${credential}`,
        }),
        { status: 400 },
      ),
    );
    try {
      await new HostTransport(machine, async () => credential, echo).request("projects.list");
    } catch (error) {
      expect(String(error)).not.toContain(credential);
    }
    expect(echo).toHaveBeenCalledTimes(1);
  });

  it("marks a malformed write response uncertain and does not replay it", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(
      new HostTransport(machine, async () => credential, fetcher).request("files.write"),
    ).rejects.toMatchObject({ kind: "protocol", uncertain: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rechecks access before a read retry after the app locks or the machine is removed", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(credential)
      .mockRejectedValueOnce(new Error("App is locked."));
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("offline"));
    await expect(
      new HostTransport(machine, read, fetcher).request("projects.list"),
    ).rejects.toMatchObject({ kind: "auth" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps constructor identity fixed when a caller mutates its original metadata", async () => {
    const source = { ...machine };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(result([]));
    const transport = new HostTransport(source, async () => credential, fetcher);
    source.environmentId = "different";
    source.endpoint = "https://other.example";
    await transport.request("projects.list");
    expect(fetcher.mock.calls[0][0]).toBe("https://pc.example/rpc");
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).environmentId).toBe("env-1");
  });
  it("redacts URL credentials and treats an errored server write as uncertain", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Failure https://host?access_token=private https://user:private@host",
        }),
        { status: 500 },
      ),
    );
    await expect(
      new HostTransport(machine, async () => credential, fetcher).request("files.write"),
    ).rejects.toMatchObject({ uncertain: true });
    try {
      await new HostTransport(machine, async () => credential, fetcher).request("projects.list");
    } catch (error) {
      expect(String(error)).not.toContain("private");
    }
  });
});
