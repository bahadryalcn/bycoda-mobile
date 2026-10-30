import { describe, expect, it, vi } from "vitest";
import { createHostClient } from "./hostClient";
import { HostTransport } from "./transport";
import { applySessionSync } from "../domain/sessionSync";
import type { HostSession } from "../domain/types";

const connection = {
  id: "pc-a",
  endpoint: "https://pc.example",
  environmentId: "env-a",
  token: "a".repeat(43),
};
const respond = (result: unknown) => new Response(JSON.stringify({ result }), { status: 200 });
describe("native host contract", () => {
  it("captures approval primitives across capability discovery and dispatches once through the actual compatibility transport", async () => {
    let release!: (response: Response) => void;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValueOnce(
        respond({ commandId: "original-command", sessionId: "s", revision: 1, acceptedAt: 1 }),
      );
    const client = createHostClient(connection, fetcher);
    const occurrenceId = "12345678-1234-4123-8123-123456789abc";
    const command = {
      type: "approve" as const,
      commandId: "original-command",
      sessionId: "s",
      runId: "original-run",
      authorityGeneration: 4,
      requestId: 7,
      approvalOccurrenceId: occurrenceId,
      decision: "allow" as const,
    };
    const pending = client.sessions.dispatch(command);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    command.approvalOccurrenceId = "abcdef12-1234-4123-9123-123456789abc";
    command.authorityGeneration = 9;
    release(
      respond({
        protocolVersion: 1,
        environmentId: "env-a",
        name: "Work PC",
        platform: "win32",
        providers: ["codex"],
        capabilities: ["sessions.approvalOccurrence.v1"],
      }),
    );
    await pending;
    const requests = fetcher.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(requests.map((request) => request.method)).toEqual([
      "environment.describe",
      "commands.dispatch",
    ]);
    expect(requests[1].params).toEqual({
      ...command,
      approvalOccurrenceId: occurrenceId,
      authorityGeneration: 4,
    });
  });

  it("refuses legacy approval identities before HTTP and unsupported Hosts after a read without dispatch", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      respond({
        protocolVersion: 1,
        environmentId: "env-a",
        name: "Old PC",
        platform: "win32",
        providers: ["codex"],
        capabilities: [],
      }),
    );
    const client = createHostClient(connection, fetcher);
    const command = {
      type: "approve" as const,
      commandId: "command",
      sessionId: "s",
      runId: "run",
      requestId: 7,
      decision: "deny" as const,
    };
    await expect(client.sessions.dispatch(command)).rejects.toMatchObject({
      reason: "unidentified",
      uncertain: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      client.sessions.dispatch({
        ...command,
        approvalOccurrenceId: "12345678-1234-4123-8123-123456789abc",
      }),
    ).rejects.toMatchObject({ reason: "unsupported", uncertain: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).method).toBe("environment.describe");
  });
  it("scopes requests to paired environment and never leaks auth in the body", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(respond([]));
    await createHostClient(connection, fetcher).sessions.list("project-a");
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://pc.example/rpc");
    expect(JSON.parse(String(options?.body))).toEqual({
      version: 1,
      environmentId: "env-a",
      method: "sessions.list",
      params: { projectId: "project-a" },
    });
    expect(options?.headers).toMatchObject({
      Authorization: `Bearer ${connection.token}`,
    });
    expect(options?.redirect).toBe("error");
  });
  it("rejects changed identity before any project action", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      respond({
        protocolVersion: 1,
        environmentId: "different",
        name: "Other",
        providers: [],
        capabilities: [],
      }),
    );
    const client = createHostClient(connection, fetcher);
    await expect(client.describe()).rejects.toMatchObject({ kind: "identity" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("never retries ambiguous failed commands", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Network failed"));
    await expect(
      createHostClient(connection, fetcher).sessions.send("s", "hello", "cmd"),
    ).rejects.toMatchObject({ kind: "disconnected" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("abort on disconnect prevents further calls until reconnect", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(respond([]));
    const transport = new HostTransport(connection, fetcher);
    transport.disconnect();
    await expect(transport.request("projects.list")).rejects.toMatchObject({
      kind: "disconnected",
    });
    expect(fetcher).not.toHaveBeenCalled();
    transport.reconnect();
    await expect(transport.request("projects.list")).resolves.toEqual([]);
  });
  it("reassembles bounded transcript chunks by UTF-16 offset", async () => {
    const snapshot = { kind: "snapshot", value: { revision: 3 } };
    const serialized = JSON.stringify(snapshot);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        respond({
          sync: {
            kind: "chunked",
            transfer: "transfer",
            length: serialized.length,
          },
        }),
      )
      .mockResolvedValueOnce(respond({ data: serialized.slice(0, 12) }))
      .mockResolvedValueOnce(respond({ data: serialized.slice(12) }));
    await expect(createHostClient(connection, fetcher).sessions.read("s")).resolves.toEqual({
      revision: 3,
    });
    expect(JSON.parse(String(fetcher.mock.calls[2]![1]?.body)).params.offset).toBe(12);
  });
  it("cancels an already-downloaded transcript decode on disconnect and allows a fresh read after reconnect", async () => {
    const sync = { kind: "snapshot", value: { revision: 3, text: "x".repeat(500_000) } };
    const serialized = JSON.stringify(sync);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        respond({ sync: { kind: "chunked", transfer: "large", length: serialized.length } }),
      )
      .mockImplementationOnce(async () => {
        setTimeout(() => client.disconnect(), 0);
        return respond({ data: serialized });
      })
      .mockResolvedValueOnce(respond({ sync: { kind: "snapshot", value: { revision: 4 } } }));
    const client = createHostClient(connection, fetcher);
    await expect(client.sessions.read("s")).rejects.toMatchObject({ kind: "disconnected" });
    client.reconnect();
    await expect(client.sessions.read("s")).resolves.toEqual({ revision: 4 });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("rechecks compatibility access while decoding and reports authentication loss", async () => {
    let allowed = true;
    const serialized = JSON.stringify({ kind: "snapshot", value: { text: "x".repeat(500_000) } });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        respond({ sync: { kind: "chunked", transfer: "large", length: serialized.length } }),
      )
      .mockImplementationOnce(async () => {
        setTimeout(() => {
          allowed = false;
        }, 0);
        return respond({ data: serialized });
      });
    const client = createHostClient(connection, fetcher, undefined, () => {
      if (!allowed) throw new Error("Workspace locked.");
    });
    await expect(client.sessions.read("s")).rejects.toMatchObject({ kind: "authentication" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects stale deltas rather than overwriting the transcript", () => {
    const known = {
      revision: 2,
      session: { id: "s", blocks: [] },
    } as unknown as HostSession;
    expect(() =>
      applySessionSync(known, {
        kind: "delta",
        base: 1,
        value: known,
        blockIds: [],
        blocks: [],
      }),
    ).toThrow("Session changed");
  });
  it("refuses insecure remote HTTP in the legacy surface", () => {
    expect(() => createHostClient({ ...connection, endpoint: "http://192.168.1.20:3774" })).toThrow(
      "HTTPS",
    );
  });
  it("pins generic descriptor requests and redacts host errors", async () => {
    const changed = vi.fn<typeof fetch>().mockResolvedValue(
      respond({
        protocolVersion: 1,
        environmentId: "other",
        name: "Other",
        providers: [],
        capabilities: [],
      }),
    );
    await expect(
      createHostClient(connection, changed).request("environment.describe"),
    ).rejects.toMatchObject({ kind: "identity" });
    const echoed = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: `Bearer ${connection.token} password=private`,
        }),
        {
          status: 400,
        },
      ),
    );
    await expect(createHostClient(connection, echoed).request("projects.list")).rejects.not.toThrow(
      connection.token,
    );
  });
  it("reads the current credential on each request instead of retaining a legacy token", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce(connection.token)
      .mockRejectedValueOnce(new Error("App is locked."));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(respond([]));
    const client = createHostClient({ ...connection, token: "" }, fetcher, read);
    await client.projects.list();
    await expect(client.projects.list()).rejects.toMatchObject({
      kind: "authentication",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("forwards the access guard and blocks writes after a deferred credential read loses access", async () => {
    let allowed = true;
    let finishRead!: (value: string) => void;
    const read = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finishRead = resolve;
        }),
    );
    const fetcher = vi.fn<typeof fetch>();
    const guard = () => {
      if (!allowed) throw new Error("App is suspended.");
    };
    const client = createHostClient({ ...connection, token: "" }, fetcher, read, guard);
    const request = client.sessions.send("s", "hello", "command-a");
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    allowed = false;
    finishRead(connection.token);
    await expect(request).rejects.toMatchObject({
      kind: "authentication",
      uncertain: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["projects.list", false],
    ["files.write", true],
  ])(
    "preserves access-loss uncertainty for a completed legacy %s request",
    async (method, uncertain) => {
      let allowed = true;
      let finishResponse!: (value: Response) => void;
      const fetcher = vi.fn<typeof fetch>(
        () =>
          new Promise<Response>((resolve) => {
            finishResponse = resolve;
          }),
      );
      const guard = () => {
        if (!allowed) throw new Error("App is locked.");
      };
      const client = createHostClient(connection, fetcher, undefined, guard);
      const request = client.request(method);
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
      allowed = false;
      finishResponse(respond({ privateHostResult: "private host content" }));
      const error = await request.catch((value) => value);
      expect(error).toMatchObject({ kind: "authentication", uncertain });
      expect(String(error)).not.toContain("private host content");
      if (uncertain) expect(String(error)).toContain("check the result before retrying");
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("retains the access guard when identity acceptance rebuilds the compatibility transport", async () => {
    let allowed = true;
    const guard = () => {
      if (!allowed) throw new Error("App is locked.");
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      respond({
        protocolVersion: 1,
        environmentId: "env-a",
        name: "Work PC",
        providers: ["codex"],
        capabilities: ["sessions"],
        platform: "win32",
      }),
    );
    const client = createHostClient(connection, fetcher, undefined, guard);
    await client.describe();
    allowed = false;
    await expect(client.projects.list()).rejects.toMatchObject({
      kind: "authentication",
      uncertain: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
