import { afterEach, expect, it, vi } from "vitest";
import { HostTransport } from "./host-transport";
import { MobileHostWsConnection } from "./ws-connection";
import { binding, fakeNative } from "./ws-connection.test-fixture";
import { registerHostWsRuntimeProvider, type HostWsConsumer } from "./ws-runtime-port";
import { createSessionsApi } from "./services/sessions-api";
import { HostClient } from "../api/hostClient";
import { dispatchCommand, UncertainCommand } from "../features/workspace/commands";
import { readEarlier, readSession } from "../features/workspace/session-wire";
import type { HostSession, MobileMachine } from "./types";

const machine: MobileMachine = {
  id: binding.machineId,
  name: "Fixture Host",
  endpoint: "https://host.example",
  environmentId: binding.environmentId,
  capabilities: ["transport.ws.sessions.v2", "transport.ws.read.v2"],
};
const receipt = { commandId: "original", sessionId: "chat", revision: 1, authorityGeneration: 7 };
const cleanups: (() => void)[] = [];
const reply = (value: unknown) => new Response(JSON.stringify({ result: value }), { status: 200 });

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function httpTransport(fetcher: typeof fetch, assertAccess?: () => void) {
  vi.stubEnv("EXPO_OS", "web");
  const credential = vi.fn(async () => "a".repeat(43));
  const transport = new HostTransport(machine, credential, fetcher, assertAccess);
  cleanups.push(() => transport.dispose());
  return { transport, credential };
}

async function socketTransport(assertAccess: () => void = () => {}) {
  vi.stubEnv("EXPO_OS", "ios");
  const native = fakeNative({
    methods: [
      "sessions.list",
      "sessions.page",
      "sessions.sync",
      "commands.dispatch",
      "commands.status",
      "requests.cancel",
    ],
  });
  const credential = await native.native.acquireCredential(binding);
  const connection = new MobileHostWsConnection(
    native.native,
    binding,
    credential,
    1,
    "fixture",
    undefined,
    undefined,
    assertAccess,
  );
  await connection.start();
  const consumer: HostWsConsumer = {
    supports: (method) => connection.supports(method),
    request: (method, params, options) => connection.request(method, params, options),
    subscribe: () => () => {},
    state: () => "ready",
    onState: () => () => {},
    release: () => connection.close(),
  };
  const acquire = vi.fn(async (selected: MobileMachine) => {
    expect(selected.environmentId).toBe(binding.environmentId);
    return consumer;
  });
  cleanups.push(registerHostWsRuntimeProvider({ acquire, remember: () => {} }));
  const fetcher = vi.fn<typeof fetch>();
  const transport = new HostTransport(machine, async () => "a".repeat(43), fetcher, assertAccess);
  cleanups.push(() => transport.dispose());
  return { ...native, connection, transport, fetcher, acquire };
}

function session(blocks = ["tail"], revision = 4, generation = 7): HostSession {
  return {
    projectId: "project",
    revision,
    authorityGeneration: generation,
    status: "idle",
    updatedAt: 1,
    history: { before: blocks[0] === "tail" ? 1 : undefined, revision, totalBlocks: 2 },
    session: {
      id: "chat",
      title: "Retained transcript",
      cwd: "G:/project/worktree",
      harness: "codex",
      model: "codex:test",
      runtimeMode: "auto",
      modelSettings: { accountOption: "retained" },
      blocks: blocks.map((id) => ({
        id,
        role: "assistant" as const,
        text: id,
        isStreaming: false,
      })),
    },
  } as HostSession;
}

it("routes the production compatibility facade through a wire snapshot without structuredClone", async () => {
  vi.stubEnv("EXPO_OS", "web");
  vi.stubGlobal("structuredClone", undefined);
  let release!: (value: string) => void;
  const credential = new Promise<string>((resolve) => {
    release = resolve;
  });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply(receipt));
  const client = new HostClient(
    {
      id: machine.id,
      endpoint: machine.endpoint,
      token: "a".repeat(43),
      environmentId: machine.environmentId,
    },
    fetcher,
    () => credential,
  );
  cleanups.push(() => client.disconnect());
  const command = {
    type: "send" as const,
    commandId: "original",
    sessionId: "chat",
    text: "retained",
    authorityGeneration: 7,
    attachments: [
      { id: "file", name: "original.txt", mimeType: "text/plain", kind: "file" as const, size: 4 },
    ],
  };
  const pending = client.sessions.dispatch(command);
  command.text = "edited";
  command.attachments[0].name = "edited.txt";
  release("a".repeat(43));
  await expect(pending).resolves.toEqual(receipt);
  const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
  expect(body).toMatchObject({
    environmentId: machine.environmentId,
    method: "commands.dispatch",
    params: {
      commandId: "original",
      text: "retained",
      authorityGeneration: 7,
      attachments: [{ name: "original.txt" }],
    },
  });
  expect(fetcher).toHaveBeenCalledOnce();
});

it("preserves list cursors and real page/sync history behavior over native authenticated WS", async () => {
  const f = await socketTransport();
  const tail = session();
  const earlier = session(["first"], 4, 5);
  f.respond(({ method, params }) => {
    if (method === "sessions.list") return { unchanged: true, etag: "known-etag" };
    if (method === "sessions.sync") return { kind: "unchanged", revision: tail.revision };
    if (method === "sessions.page") {
      const value = params.before === undefined ? tail : earlier;
      return { revision: value.revision, totalBlocks: 2, sync: { kind: "snapshot", value } };
    }
    return undefined;
  });
  const api = createSessionsApi(f.transport, (method, params, options) =>
    f.transport.request(method, params, options),
  );
  await expect(api.sessions.listChanges("project", "known-etag")).resolves.toEqual({
    unchanged: true,
    etag: "known-etag",
  });
  const read = await readSession(f.transport, "chat");
  expect(read.session.cwd).toBe("G:/project/worktree");
  const paged = await readEarlier(f.transport, read);
  expect(paged.session.blocks.map((block) => block.id)).toEqual(["first", "tail"]);
  expect(paged.authorityGeneration).toBe(7);
  expect(paged.session.modelSettings).toEqual({ accountOption: "retained" });
  await expect(api.sessions.synchronize("chat", paged, undefined, 12_000)).resolves.toEqual(paged);
  expect(f.sent.filter(({ method }) => method === "sessions.list")[0].params).toEqual({
    projectId: "project",
    known: "known-etag",
  });
  expect(f.sent.filter(({ method }) => method === "sessions.page")[1].params).toEqual({
    sessionId: "chat",
    before: 1,
    revision: 4,
    preview: true,
  });
  expect(f.sent.find(({ method }) => method === "sessions.sync")?.params).toEqual({
    sessionId: "chat",
    revision: 4,
    waitMs: 12_000,
    partial: true,
    loadedBlockIds: ["first", "tail"],
  });
  expect(f.fetcher).not.toHaveBeenCalled();
});

it("keeps unknown delivery and status on the original command ID without replay or HTTP fallback", async () => {
  const f = await socketTransport();
  f.respond(({ method }) => (method === "commands.status" ? null : undefined));
  const send = vi.mocked(f.native.send).getMockImplementation()!;
  vi.mocked(f.native.send).mockImplementationOnce(async (...args) => {
    // Bytes reached the socket; the native bridge acknowledgement was lost.
    await send(...args);
    throw new Error("lost native send acknowledgement");
  });
  const pending = dispatchCommand(f.transport, "original", {
    type: "send",
    sessionId: "chat",
    text: "keep draft",
    authorityGeneration: 7,
  });
  const error = await pending.catch((error: unknown) => error);
  expect(error).toBeInstanceOf(UncertainCommand);
  expect(error).toMatchObject({
    commandId: "original",
    authorityGeneration: 7,
    client: f.transport,
  });
  // Reopening recovery reads this same receipt; it never reconstructs a send.
  f.respond(({ method }) => (method === "commands.status" ? receipt : undefined));
  await expect(
    f.transport.request("commands.status", { commandId: (error as UncertainCommand).commandId }),
  ).resolves.toEqual(receipt);
  expect(f.sent.filter(({ method }) => method === "commands.dispatch")).toHaveLength(1);
  expect(
    f.sent.filter(({ method }) => method === "commands.status").map(({ params }) => params),
  ).toEqual([{ commandId: "original" }, { commandId: "original" }]);
  expect(f.fetcher).not.toHaveBeenCalled();
});

it("admits no IO for same-tick detach, and leaves admitted work recoverable after detach", async () => {
  const f = await socketTransport();
  const before = new AbortController();
  const notAdmitted = f.transport.request(
    "commands.dispatch",
    { type: "send", commandId: "unsent", sessionId: "chat", text: "draft" },
    { signal: before.signal },
  );
  const rejectedBefore = expect(notAdmitted).rejects.toMatchObject({
    kind: "aborted",
    uncertain: false,
  });
  before.abort();
  await rejectedBefore;
  expect(f.acquire).not.toHaveBeenCalled();
  expect(f.sent.filter(({ method }) => method === "commands.dispatch")).toHaveLength(0);

  const admitted = new AbortController();
  let received!: () => void;
  const sent = new Promise<void>((resolve) => {
    received = resolve;
  });
  f.respond(({ method }) => {
    if (method === "commands.dispatch") received();
    return undefined;
  });
  const pending = f.transport.request(
    "commands.dispatch",
    { type: "send", commandId: "original", sessionId: "chat", text: "retained" },
    { signal: admitted.signal },
  );
  const rejectedAfter = expect(pending).rejects.toMatchObject({ kind: "aborted", uncertain: true });
  await sent;
  admitted.abort();
  await rejectedAfter;
  const original = f.sent.find(({ method }) => method === "commands.dispatch")!;
  f.emit({ jsonrpc: "2.0", id: original.id, result: receipt });
  f.respond(({ method }) => (method === "commands.status" ? receipt : undefined));
  await expect(f.transport.request("commands.status", { commandId: "original" })).resolves.toEqual(
    receipt,
  );
  expect(f.sent.filter(({ method }) => method === "commands.dispatch")).toHaveLength(1);
  expect(f.sent.filter(({ method }) => method === "requests.cancel")).toHaveLength(0);
});

it("rejects owner replacement before dispatch and fences a late receipt after owner replacement", async () => {
  let currentEnvironment = machine.environmentId;
  const assertAccess = () => {
    if (currentEnvironment !== machine.environmentId) throw new Error("saved owner replaced");
  };
  let release!: (value: Response) => void;
  const fetcher = vi.fn<typeof fetch>(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const f = httpTransport(fetcher, assertAccess);
  const pending = f.transport.request("commands.dispatch", {
    type: "send",
    commandId: "original",
    sessionId: "chat",
    text: "keep",
  });
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  currentEnvironment = "replacement-environment";
  release(reply(receipt));
  await expect(pending).rejects.toMatchObject({ kind: "auth", uncertain: true });
  await expect(
    f.transport.request("commands.status", { commandId: "original" }),
  ).rejects.toMatchObject({ kind: "auth", uncertain: false });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).environmentId).toBe(
    machine.environmentId,
  );
  expect(f.credential).toHaveBeenCalledOnce();
});
