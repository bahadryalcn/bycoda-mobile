import { afterEach, describe, expect, it, vi } from "vitest";
import { HostTransport } from "./host-transport";
import { HostWsError, MobileHostWsConnection, type HostWsRequestOptions } from "./ws-connection";
import { binding, fakeNative } from "./ws-connection.test-fixture";
import type { HostSteward } from "./types";
import {
  getHostRpcMethod,
  HOST_RPC_METHODS,
  type CrewDefinition,
} from "../../../src/shared/model/host-contracts";
import {
  registerHostWsRuntimeProvider,
  type HostWsConsumer,
  type HostWsRuntimeProvider,
} from "./ws-runtime-port";

const machine = {
  id: "machine-a",
  name: "Host",
  environmentId: "environment-a",
  endpoint: "https://host.example",
  capabilities: ["transport.ws.sessions.v2"],
};
const cleanups: (() => void)[] = [];

it.each(["web", "ios"])(
  "denies private Native and bridge operations before credentials or %s HTTP/WS transport",
  async (platform) => {
    const previous = process.env.EXPO_OS;
    process.env.EXPO_OS = platform;
    try {
      const p = provider();
      const f = transport([
        "transport.ws.v2",
        "native.buffers.recovery.v1",
        "native.workspaces.v1",
        "native.buffers.upload.v1",
        "transport.ws.devServers.v2",
      ]);
      const methods = Object.keys(HOST_RPC_METHODS).filter(
        (method) => method.startsWith("native.") || method.startsWith("devServers.bridge"),
      );
      expect(methods).toContain("native.buffers.upload.commit");
      expect(methods).toContain("native.turn.begin");
      expect(methods).toEqual(
        expect.arrayContaining([
          "devServers.bridgeCheck",
          "devServers.bridgeOpen",
          "devServers.bridgeRead",
          "devServers.bridgeWrite",
          "devServers.bridgeClose",
        ]),
      );
      for (const method of [...methods, "native.future.operation", "devServers.bridgeFuture"])
        await expect(f.client.request(method, {})).rejects.toMatchObject({
          kind: "unsupported",
          uncertain: false,
        });
      expect(f.credential).not.toHaveBeenCalled();
      expect(f.fetcher).not.toHaveBeenCalled();
      expect(p.runtime.acquire).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.EXPO_OS;
      else process.env.EXPO_OS = previous;
    }
  },
);
it.each(["web", "ios"])(
  "preserves generic cleanup and dev-server catalog routes over %s transport",
  async (platform) => {
    const previous = process.env.EXPO_OS;
    process.env.EXPO_OS = platform;
    try {
      const p = provider();
      const f = transport(["transport.ws.workspaces.cleanup.v1", "transport.ws.devServers.v2"]);
      const requests = [
        ["workspaces.cleanup.plan", { workspaceId: "workspace", expectedRevision: 1 }],
        [
          "workspaces.cleanup.apply",
          {
            workspaceId: "workspace",
            expectedRevision: 1,
            idempotencyKey: "operation",
            planToken: "plan",
          },
        ],
        ["workspaces.cleanup.status", { workspaceId: "workspace", operationId: "operation" }],
        ["devServers.list", { projectId: "project" }],
      ] as const;
      for (const [method, params] of requests) await f.client.request(method, params);
      if (platform === "web") {
        expect(
          f.fetcher.mock.calls.map(([, options]) => JSON.parse(String(options?.body)).method),
        ).toEqual(requests.map(([method]) => method));
        expect(p.runtime.acquire).not.toHaveBeenCalled();
      } else {
        expect(vi.mocked(p.consumer.request).mock.calls.map(([method]) => method)).toEqual(
          requests.map(([method]) => method),
        );
        expect(f.fetcher).not.toHaveBeenCalled();
      }
    } finally {
      if (previous === undefined) delete process.env.EXPO_OS;
      else process.env.EXPO_OS = previous;
    }
  },
);
function provider() {
  const consumer: HostWsConsumer = {
    supports: () => true,
    request: vi.fn(async () => [] as never),
    subscribe: vi.fn(() => () => undefined),
    state: () => "ready",
    onState: vi.fn(() => () => undefined),
    release: vi.fn(),
  };
  const runtime: HostWsRuntimeProvider = {
    acquire: vi.fn(async () => consumer),
    remember: vi.fn(),
  };
  cleanups.push(registerHostWsRuntimeProvider(runtime));
  return { runtime, consumer };
}
function transport(capabilities = machine.capabilities) {
  const credential = vi.fn(async () => "a".repeat(43));
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify({ result: [] }), { status: 200 }),
  );
  const client = new HostTransport({ ...machine, capabilities }, credential, fetcher);
  cleanups.push(() => client.dispose());
  return { client, credential, fetcher };
}

const stewardCapability = "transport.ws.stewards.v2";
const savedSteward: HostSteward = {
  id: "steward",
  projectId: "project",
  enabled: false,
  harness: "codex",
  model: "codex:test",
  modelSettings: { retainedProviderOption: "yes" },
  runtimeMode: "auto",
  focus: "Focus 🙂",
  scheduleKind: "daily",
  minute: 0,
  time: "09:00",
  dayOfWeek: 0,
  maxProposals: 5,
  maxOpen: 10,
  autoStart: false,
  autoMerge: false,
  isolate: false,
  deliveryApprovalRequired: true,
  nextRunAt: 10,
  lastRunAt: 0,
  lastRunStatus: "running",
  lastRunError: "Retained error",
  lastSessionId: "session",
  lastProposed: 0,
  declined: ["normalized title"],
  run: {
    startedAt: 0,
    workspaceId: "workspace",
    activityId: "activity",
    sessionId: "session",
    runId: "turn",
    worktreeCwd: "/checkout",
    branch: "steward/branch",
    error: "Retained run error",
  },
  createdAt: 0,
  updatedAt: 1,
};

async function stewardConnection(
  methods = [
    "stewards.list",
    "stewards.save",
    "stewards.delete",
    "stewards.runNow",
    "stewards.decline",
  ],
) {
  return familyConnection(stewardCapability, methods);
}
async function familyConnection(capability: string, methods: string[]) {
  const f = fakeNative({ methods, capabilities: [capability] });
  const connection = new MobileHostWsConnection(
    f.native,
    binding,
    await f.native.acquireCredential(binding),
    1,
    "family-compat",
  );
  cleanups.push(() => connection.close());
  await connection.start();
  const p = provider();
  p.consumer.supports = (method) => connection.supports(method);
  p.consumer.request = <T>(
    method: string,
    params?: Record<string, unknown>,
    options?: HostWsRequestOptions,
  ) => connection.request<T>(method, params, options);
  return { ...f, ...p, connection };
}

const crewCapability = "transport.ws.crews.v2";
const savedCrew: CrewDefinition = {
  id: "crew",
  projectId: "project",
  name: "Product Crew 🙂",
  updatedAt: 1,
  policy: {
    preset: "balanced",
    maxParallel: 2,
    maxAssignments: 20,
    maxRunMinutes: 30,
    maxEstimatedCost: 12.5,
    minimumQuality: 60,
    costWeight: 0.4,
    qualityWeight: 0.6,
    allowUnknownCost: false,
    allowSubagents: false,
    delegateApprovals: true,
  },
  agents: (["coordinator", "specialist", "reviewer", "advisor"] as const).map((role) => ({
    id: role,
    name: `${role} member`,
    role,
    instructions: `${role} instructions\nPreserve owner work.`,
    groups: ["Core", "Shared 🙂"],
    source: { id: `library-${role}`, updatedAt: 1 },
    selection: "automatic",
    candidates: [
      {
        id: `${role}-candidate`,
        harness: "codex",
        model: "codex:test",
        modelSettings: { retainedProviderOption: "yes" },
        capabilities: {
          code: {
            state: "unknown",
            observedAt: 1,
            source: "owner declaration; runtime verification required",
          },
        },
        cost: 1.5,
        quality: 90,
        qualitySource: "owner-estimate",
        samples: 3,
      },
    ],
  })),
};
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.useRealTimers();
});

const deviceCapability = "transport.ws.devices.v1";
const deviceCases = [
  [
    "devices.capture",
    { deviceId: "simulator" },
    { mime: "image/png", base64: "private-frame", capturedAt: "2026-10-29T00:00:00.000Z" },
  ],
  [
    "devices.action",
    { deviceId: "simulator", action: { type: "press", x: 1, y: 2 } },
    '{"ok":true}',
  ],
  [
    "devices.preview",
    { deviceId: "simulator", requestId: "original-preview", url: "exp://127.0.0.1:8081" },
    {
      id: "preview-job",
      requestId: "original-preview",
      deviceId: "simulator",
      state: "queued",
      stages: [],
      verification: "launch-only",
      updatedAt: "2026-10-29T00:00:00.000Z",
    },
  ],
] as const;

describe("canonical paired device consumer", () => {
  it.each(deviceCases)(
    "sends %s with its original identity once over the device cohort",
    async (method, params, result) => {
      const p = provider(),
        f = transport([deviceCapability]);
      vi.mocked(p.consumer.request).mockResolvedValueOnce(result as never);
      expect(getHostRpcMethod(method)?.retry).toBe("never");
      await expect(f.client.request(method, { ...params })).resolves.toEqual(result);
      expect(p.consumer.request).toHaveBeenCalledExactlyOnceWith(method, params, expect.anything());
      expect(f.credential).not.toHaveBeenCalled();
      expect(f.fetcher).not.toHaveBeenCalled();
    },
  );

  it.each(deviceCases)("never replays dispatched %s after socket loss", async (method, params) => {
    const p = provider(),
      f = transport([deviceCapability]);
    vi.mocked(p.consumer.request).mockRejectedValueOnce(new HostWsError("network", true));
    await expect(f.client.request(method, { ...params })).rejects.toMatchObject({
      kind: "network",
      uncertain: true,
    });
    expect(p.consumer.request).toHaveBeenCalledExactlyOnceWith(method, params, expect.anything());
    expect(f.credential).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
  });

  it.each(deviceCases)(
    "keeps dispatched %s uncertain and suppresses data when access locks",
    async (method, params, result) => {
      const p = provider(),
        credential = vi.fn(async () => "a".repeat(43)),
        fetcher = vi.fn();
      let locked = false,
        complete!: () => void;
      const client = new HostTransport(
        { ...machine, capabilities: [deviceCapability] },
        credential,
        fetcher,
        () => {
          if (locked) throw new Error("locked");
        },
      );
      cleanups.push(() => client.dispose());
      vi.mocked(p.consumer.request).mockImplementationOnce(
        () =>
          new Promise<never>((resolve) => {
            complete = () => resolve(result as never);
          }),
      );
      const pending = client.request(method, { ...params }).catch((error: unknown) => error);
      await vi.waitFor(() => expect(p.consumer.request).toHaveBeenCalledTimes(1));
      locked = true;
      complete();
      const error = await pending;
      expect(error).toMatchObject({ kind: "auth", uncertain: true });
      expect(error).not.toHaveProperty("result");
      expect(error).not.toHaveProperty("frame");
      expect(p.consumer.request).toHaveBeenCalledTimes(1);
      expect(credential).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each(deviceCases)(
    "retains %s timeout uncertainty without a retry or HTTP fallback",
    async (method, params) => {
      vi.useFakeTimers();
      const p = provider(),
        f = transport([deviceCapability]);
      vi.mocked(p.consumer.request).mockImplementationOnce(
        (_method, _params, options) =>
          new Promise<never>((_resolve, reject) => {
            options?.signal?.addEventListener(
              "abort",
              () => reject(new HostWsError("deadline", true)),
              { once: true },
            );
          }),
      );
      const pending = f.client
        .request(method, { ...params }, { timeoutMs: 1_000 })
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(0);
      expect(p.consumer.request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await pending).toMatchObject({ kind: "timeout", uncertain: true });
      expect(getHostRpcMethod(method)?.retry).toBe("never");
      expect(p.consumer.request).toHaveBeenCalledTimes(1);
      expect(f.credential).not.toHaveBeenCalled();
      expect(f.fetcher).not.toHaveBeenCalled();
    },
  );
});

const mobilePreviewCapability = "transport.ws.devices.preview.mobile.v1";
const lifecycleStatus = {
  running: false,
  installed: true,
  agentInstalled: false,
  platform: "win32",
  platforms: [{ platform: "android", available: true }],
};
const mobilePreview = {
  id: "mobile-preview-job",
  requestId: "mobile-original",
  deviceId: "simulator",
  state: "queued",
  stages: [],
  verification: "launch-only",
  updatedAt: "2026-10-29T00:00:00.000Z",
};
const deviceLifecycleCases = [
  [
    "devices.setup",
    { projectId: "project", agentAccess: false },
    lifecycleStatus,
    deviceCapability,
    "never",
  ],
  ["devices.stop", { projectId: "project" }, lifecycleStatus, deviceCapability, "never"],
  [
    "devices.preview.mobile.start",
    {
      projectId: "project",
      requestId: "mobile-original",
      deviceId: "simulator",
      url: "exp://127.0.0.1:8081",
      installExpoGo: false,
    },
    mobilePreview,
    mobilePreviewCapability,
    "never",
  ],
  [
    "devices.preview.mobile.status",
    { projectId: "project", requestId: "mobile-original", includeFrame: true },
    {
      ...mobilePreview,
      frame: { mime: "image/png", base64: "iVBORw0KGgo=", capturedAt: "2026-10-29T00:00:00.000Z" },
    },
    mobilePreviewCapability,
    "safe-query",
  ],
  [
    "devices.preview.impact",
    { projectId: "project" },
    {
      activeCount: 1,
      owned: [{ id: "mobile-preview-job", deviceId: "simulator", state: "running" }],
      otherActiveCount: 0,
    },
    mobilePreviewCapability,
    "safe-query",
  ],
] as const;

describe("device lifecycle and mobile preview WS policy", () => {
  it.each(deviceLifecycleCases)(
    "selects %s by its transport capability and retains original payload",
    async (method, params, result, capability, retry) => {
      const p = provider(),
        f = transport([capability, "device.host", "devices.preview.mobile.v1"]);
      expect(getHostRpcMethod(method)?.retry).toBe(retry);
      expect(getHostRpcMethod(method)?.requiredCapability).toBe(capability);
      vi.mocked(p.consumer.request).mockResolvedValueOnce(result as never);
      await expect(f.client.request(method, { ...params })).resolves.toEqual(result);
      expect(p.consumer.request).toHaveBeenCalledExactlyOnceWith(method, params, expect.anything());
      expect(f.credential).not.toHaveBeenCalled();
      expect(f.fetcher).not.toHaveBeenCalled();
    },
  );

  it.each(deviceLifecycleCases)(
    "does not replay dispatched %s or fall back to HTTP",
    async (method, params, _result, capability, retry) => {
      const p = provider(),
        f = transport([capability]);
      vi.mocked(p.consumer.request).mockRejectedValueOnce(
        new HostWsError("network", retry === "never"),
      );
      await expect(f.client.request(method, { ...params })).rejects.toMatchObject({
        kind: "network",
        uncertain: retry === "never",
      });
      expect(p.consumer.request).toHaveBeenCalledExactlyOnceWith(method, params, expect.anything());
      expect(f.credential).not.toHaveBeenCalled();
      expect(f.fetcher).not.toHaveBeenCalled();
    },
  );

  it.each(deviceLifecycleCases)(
    "keeps %s effect/read uncertainty distinct when access locks",
    async (method, params, result, capability, retry) => {
      const p = provider(),
        credential = vi.fn(async () => "a".repeat(43)),
        fetcher = vi.fn();
      let locked = false,
        complete!: () => void;
      const client = new HostTransport(
        { ...machine, capabilities: [capability] },
        credential,
        fetcher,
        () => {
          if (locked) throw new Error("locked");
        },
      );
      cleanups.push(() => client.dispose());
      vi.mocked(p.consumer.request).mockImplementationOnce(
        () =>
          new Promise<never>((resolve) => {
            complete = () => resolve(result as never);
          }),
      );
      const pending = client.request(method, { ...params }).catch((error: unknown) => error);
      await vi.waitFor(() => expect(p.consumer.request).toHaveBeenCalledTimes(1));
      locked = true;
      complete();
      const error = await pending;
      expect(error).toMatchObject({ kind: "auth", uncertain: retry === "never" });
      expect(error).not.toHaveProperty("result");
      expect(error).not.toHaveProperty("frame");
      expect(p.consumer.request).toHaveBeenCalledTimes(1);
      expect(credential).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each(deviceLifecycleCases)(
    "does not mistake legacy availability for %s WS authority",
    async (method, params, result) => {
      const p = provider(),
        f = transport(["device.host", "devices.preview.mobile.v1"]);
      f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ result }), { status: 200 }));
      await expect(f.client.request(method, { ...params })).resolves.toEqual(result);
      expect(p.runtime.acquire).not.toHaveBeenCalled();
      expect(p.consumer.request).not.toHaveBeenCalled();
      expect(f.credential).toHaveBeenCalledTimes(1);
      expect(f.fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(f.fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
        method,
        params,
      });
    },
  );
});

describe("existing mobile facade to native WS consumer", () => {
  it("discovers a Crew-only Host and sends full closed definition CAS/read through its negotiated native cohort", async () => {
    const p = await familyConnection(crewCapability, ["crews.save", "crews.list"]);
    const updated = { ...savedCrew, name: "Edited crew", updatedAt: 2 };
    const directory = { agents: [], definitions: [updated], runs: [] };
    p.respond((request) => (request.method === "crews.list" ? directory : updated));
    const descriptor = {
      protocolVersion: 1,
      environmentId: machine.environmentId,
      name: "Crew Host",
      providers: ["codex"],
      capabilities: [crewCapability],
    };
    const credential = vi.fn(async () => "a".repeat(43));
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ result: descriptor }), { status: 200 }),
    );
    const client = new HostTransport(
      { ...machine, capabilities: [crewCapability] },
      credential,
      fetcher,
    );
    cleanups.push(() => client.dispose());
    expect(await client.describe()).toEqual(descriptor);
    expect(p.runtime.remember).toHaveBeenCalledWith(
      expect.objectContaining({ id: machine.id }),
      descriptor,
    );
    expect(p.runtime.acquire).not.toHaveBeenCalled();
    const params = {
      projectId: "project",
      definition: { ...savedCrew, name: "Edited crew" },
      expectedUpdatedAt: savedCrew.updatedAt,
    };
    expect(await client.request("crews.save", params)).toEqual(updated);
    expect(await client.request("crews.list", { projectId: "project" })).toEqual(directory);
    expect(p.sent.map((request) => request.method)).toEqual([
      "connection.hello",
      "crews.save",
      "crews.list",
    ]);
    expect(p.sent.find((request) => request.method === "crews.save")!.params).toEqual(params);
    expect(p.connection.supports("crews.start")).toBe(false);
    expect(p.connection.supports("projects.list")).toBe(false);
    expect(p.runtime.acquire).toHaveBeenCalledTimes(1);
    expect(p.native.open).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1); // Authenticated discovery only.
    expect(credential).toHaveBeenCalledTimes(1);
  });

  it("never replays a Crew start or falls back after a native post-send disconnect", async () => {
    const p = await familyConnection(crewCapability, ["crews.start"]);
    p.respond(() => {
      queueMicrotask(() => p.event("closed"));
      return undefined;
    });
    const credential = vi.fn(async () => "a".repeat(43)),
      fetcher = vi.fn();
    const client = new HostTransport(
      { ...machine, capabilities: [crewCapability] },
      credential,
      fetcher,
    );
    cleanups.push(() => client.dispose());
    const params = {
      projectId: "project",
      definitionId: savedCrew.id,
      prompt: "Retained owner request",
      requestId: "crew-launch-retained",
      newConversation: true,
    };
    await expect(client.request("crews.start", params)).rejects.toMatchObject({
      kind: "network",
      uncertain: true,
    });
    expect(p.sent.map((request) => request.method)).toEqual(["connection.hello", "crews.start"]);
    expect(p.sent[1]!.params).toEqual(params);
    expect(p.native.open).toHaveBeenCalledTimes(1);
    expect(p.runtime.acquire).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
    expect(credential).not.toHaveBeenCalled();
  });

  it("keeps an unknown retained Crew input on original HTTP before native acquisition instead of stripping it", async () => {
    const p = provider();
    const credential = vi.fn(async () => "a".repeat(43));
    const fetcher = vi.fn(
      async (_input: Parameters<typeof fetch>[0], _options?: Parameters<typeof fetch>[1]) =>
        new Response(JSON.stringify({ result: savedCrew }), { status: 200 }),
    );
    const client = new HostTransport(
      { ...machine, capabilities: [crewCapability] },
      credential,
      fetcher,
    );
    cleanups.push(() => client.dispose());
    const params = {
      projectId: "project",
      definition: { ...savedCrew, legacyUiHint: { retained: "yes" } },
      expectedUpdatedAt: savedCrew.updatedAt,
    };
    expect(await client.request("crews.save", params)).toEqual(savedCrew);
    expect(p.runtime.acquire).not.toHaveBeenCalled();
    expect(p.consumer.request).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(body.method).toBe("crews.save");
    expect(body.params).toEqual(params);
  });

  it("sends a full Steward row/configuration CAS through a Steward-only negotiated WSS cohort without the generic read pilot cap", async () => {
    const p = await stewardConnection();
    const updated = { ...savedSteward, enabled: true, updatedAt: 2 };
    p.respond((request) => (request.method === "stewards.list" ? [updated] : updated));
    const credential = vi.fn(async () => "a".repeat(43)),
      fetcher = vi.fn();
    const client = new HostTransport(
      { ...machine, capabilities: [stewardCapability] },
      credential,
      fetcher,
    );
    cleanups.push(() => client.dispose());
    const params = {
      steward: {
        ...savedSteward,
        enabled: true,
        expectedConfiguration: savedSteward,
      },
    };
    expect(await client.request("stewards.save", params)).toEqual(updated);
    expect(await client.request("stewards.list", {})).toEqual([updated]);
    for (const method of [
      "stewards.list",
      "stewards.save",
      "stewards.delete",
      "stewards.runNow",
      "stewards.decline",
    ])
      expect(p.connection.supports(method)).toBe(true);
    expect(p.connection.supports("projects.list")).toBe(false);
    expect(p.sent.filter((request) => request.method === "stewards.save")).toHaveLength(1);
    expect(p.sent.find((request) => request.method === "stewards.save")!.params).toEqual(params);
    expect(p.runtime.acquire).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
    expect(credential).not.toHaveBeenCalled();
  });

  it("keeps a Steward method absent from negotiated hello.methods on original HTTP before WS admission", async () => {
    const p = await stewardConnection(["stewards.list"]);
    const credential = vi.fn(async () => "a".repeat(43));
    const fetcher = vi.fn(
      async (_input: Parameters<typeof fetch>[0], _options?: Parameters<typeof fetch>[1]) =>
        new Response(JSON.stringify({ result: savedSteward }), { status: 200 }),
    );
    const client = new HostTransport(
      { ...machine, capabilities: [stewardCapability] },
      credential,
      fetcher,
    );
    cleanups.push(() => client.dispose());
    const params = {
      steward: { ...savedSteward, expectedConfiguration: savedSteward },
    };
    await client.request("stewards.save", params);
    expect(p.sent.map((request) => request.method)).toEqual(["connection.hello"]);
    expect(p.runtime.acquire).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(body.method).toBe("stewards.save");
    expect(body.params).toEqual(params);
  });

  it.each(["owner-default-null", "unknown-retained-field"] as const)(
    "keeps legacy Steward input on original HTTP before native acquisition (%s)",
    async (variant) => {
      const p = provider(),
        credential = vi.fn(async () => "a".repeat(43));
      const fetcher = vi.fn(
        async (_input: Parameters<typeof fetch>[0], _options?: Parameters<typeof fetch>[1]) =>
          new Response(JSON.stringify({ result: savedSteward }), {
            status: 200,
          }),
      );
      const client = new HostTransport(
        { ...machine, capabilities: [stewardCapability] },
        credential,
        fetcher,
      );
      cleanups.push(() => client.dispose());
      const params = {
        steward: {
          ...savedSteward,
          expectedConfiguration: savedSteward,
          ...(variant === "owner-default-null"
            ? { focus: null, modelSettings: null }
            : { futureOwnerVariant: { retained: true } }),
        },
      };
      await client.request("stewards.save", params);
      expect(p.runtime.acquire).not.toHaveBeenCalled();
      expect(p.consumer.request).not.toHaveBeenCalled();
      const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
      expect(body.method).toBe("stewards.save");
      expect(body.params).toEqual(params);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("preserves the old read-only mobile pilot on HTTP before acquiring native WS", async () => {
    const p = provider(),
      credential = vi.fn(async () => "a".repeat(43));
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ result: [] }), { status: 200 }),
    );
    const client = new HostTransport(
      { ...machine, capabilities: ["transport.ws.read.v2"] },
      credential,
      fetcher,
    );
    cleanups.push(() => client.dispose());
    expect(await client.request("projects.list", {})).toEqual([]);
    expect(p.runtime.acquire).not.toHaveBeenCalled();
    expect(p.consumer.request).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(["legacy-cohort", "not-negotiated"] as const)(
    "preserves the original HTTP alias for pre-send compatibility (%s)",
    async (reason) => {
      const p = provider();
      p.consumer.supports = () => false;
      const credential = vi.fn(async () => "a".repeat(43));
      const fetcher = vi.fn(
        async (_input: Parameters<typeof fetch>[0], _options?: Parameters<typeof fetch>[1]) =>
          new Response(JSON.stringify({ result: null }), { status: 200 }),
      );
      const client = new HostTransport(
        {
          ...machine,
          capabilities: reason === "legacy-cohort" ? [] : ["transport.ws.goals.v2"],
        },
        credential,
        fetcher,
      );
      cleanups.push(() => client.dispose());
      await client.request("goals.final-review.recheck", {
        goalId: "goal",
        expectedUpdatedAt: 1,
      });
      expect(p.consumer.request).not.toHaveBeenCalled();
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toMatchObject({
        method: "goals.final-review.recheck",
        params: { goalId: "goal", expectedUpdatedAt: 1 },
      });
      expect(p.runtime.acquire).toHaveBeenCalledTimes(reason === "legacy-cohort" ? 0 : 1);
    },
  );
  it("sends the canonical goal alias once and never falls back after admission", async () => {
    const p = provider();
    const credential = vi.fn(async () => "a".repeat(43)),
      fetcher = vi.fn();
    const client = new HostTransport(
      { ...machine, capabilities: ["transport.ws.goals.v2"] },
      credential,
      fetcher,
    );
    cleanups.push(() => client.dispose());
    vi.mocked(p.consumer.request).mockRejectedValue(new HostWsError("network", true));
    await expect(
      client.request("goals.final-review.recheck", {
        goalId: "goal",
        expectedUpdatedAt: 1,
      }),
    ).rejects.toMatchObject({ kind: "network", uncertain: true });
    expect(p.consumer.request).toHaveBeenCalledExactlyOnceWith(
      "goals.finalReview.recheck",
      { goalId: "goal", expectedUpdatedAt: 1 },
      expect.anything(),
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(credential).not.toHaveBeenCalled();
  });
  it("makes tombstones terminal before stalled commits/callbacks and rejects pinned old replies", async () => {
    const p = provider();
    let deliver!: Parameters<HostWsConsumer["subscribe"]>[0];
    vi.mocked(p.consumer.subscribe).mockImplementation((handler) => {
      deliver = handler;
      return () => undefined;
    });
    let releaseRead!: (value: unknown) => void;
    const read = new Promise((resolve) => {
      releaseRead = resolve;
    });
    vi.mocked(p.consumer.request).mockImplementation(
      async (method, params) =>
        (method === "subscriptions.open"
          ? { subscriptionId: params!.subscriptionId, streamId: "stream-a" }
          : method === "sessions.page"
            ? await read
            : { accepted: true }) as never,
    );
    const client = new HostTransport(
      {
        ...machine,
        capabilities: [...machine.capabilities, "transport.ws.streams.v2"],
      },
      async () => {
        throw new Error("No JS credential read");
      },
    );
    cleanups.push(() => client.dispose());
    let guard!: () => void,
      releaseCommit!: () => void,
      writes = 0;
    const blocked = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const errors: Error[] = [];
    await client.observeStream(
      { kind: "session", sessionId: "session-a" },
      async (_event, assertCurrent) => {
        guard = assertCurrent;
        await blocked;
        assertCurrent();
        writes++;
        return true;
      },
      (error) => {
        expect(() => guard()).toThrow();
        errors.push(error);
        return new Promise<void>(() => undefined);
      },
    );
    await vi.waitFor(() =>
      expect(p.consumer.request).toHaveBeenCalledWith("subscriptions.open", expect.anything()),
    );
    const id = vi
      .mocked(p.consumer.request)
      .mock.calls.find((call) => call[0] === "subscriptions.open")![1]!.subscriptionId as string;
    const params = {
      subscriptionId: id,
      streamId: "stream-a",
      cursor: { epoch: "epoch-a", sequence: 1 },
    };
    const oldCommit = deliver(
      {
        jsonrpc: "2.0",
        method: "subscription.event",
        params: { ...params, kind: "snapshot", data: {} },
      },
      () => undefined,
    );
    await vi.waitFor(() => expect(guard).toBeDefined());
    const oldRead = client
      .request("sessions.page", { sessionId: "session-a", revision: 1 })
      .catch((error) => error);
    await vi.waitFor(() =>
      expect(p.consumer.request).toHaveBeenCalledWith(
        "sessions.page",
        expect.anything(),
        expect.anything(),
      ),
    );
    expect(
      await deliver(
        {
          jsonrpc: "2.0",
          method: "subscription.event",
          params: {
            ...params,
            kind: "closed",
            cursor: { epoch: "epoch-a", sequence: 2 },
            data: { reason: "deleted" },
          },
        },
        () => undefined,
      ),
    ).toBe(true);
    expect(errors).toEqual([expect.objectContaining({ kind: "identity" })]);
    releaseCommit();
    releaseRead({ oldPinnedHistory: true });
    expect(await oldCommit).toBe(false);
    expect(writes).toBe(0);
    expect(await oldRead).toMatchObject({ kind: "identity", uncertain: false });
    await expect(
      client.request("sessions.page", { sessionId: "session-a", revision: 1 }),
    ).rejects.toMatchObject({ kind: "identity" });
    expect(
      vi.mocked(p.consumer.request).mock.calls.filter((call) => call[0] === "subscriptions.open"),
    ).toHaveLength(1);
  });
  it("uses the socket cohort without calling the JS credential getter or HTTP", async () => {
    const p = provider(),
      f = transport();
    expect(await f.client.request("sessions.list", { projectId: "project-a" })).toEqual([]);
    expect(p.runtime.acquire).toHaveBeenCalledTimes(1);
    expect(f.credential).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
    f.client.dispose();
    expect(p.consumer.release).toHaveBeenCalledTimes(1);
  });
  it("keeps unported domains on their explicit HTTP cohort", async () => {
    const p = provider(),
      f = transport();
    await f.client.request("notes.list", {});
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(f.credential).toHaveBeenCalledTimes(1);
    expect(p.runtime.acquire).not.toHaveBeenCalled();
  });
  it("selects compatibility before sending when hello has not negotiated the method", async () => {
    const p = provider(),
      f = transport();
    p.consumer.supports = () => false;
    expect(await f.client.request("sessions.list", { projectId: "project-a" })).toEqual([]);
    expect(p.consumer.request).not.toHaveBeenCalled();
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(f.credential).toHaveBeenCalledTimes(1);
  });
  it("never falls back to HTTP or replays an uncertain socket command", async () => {
    const p = provider(),
      f = transport();
    vi.mocked(p.consumer.request).mockRejectedValue(new HostWsError("network", true, "command-a"));
    await expect(
      f.client.request("commands.dispatch", {
        type: "cancel",
        commandId: "command-a",
        sessionId: "session-a",
        runId: "run-a",
      }),
    ).rejects.toMatchObject({ kind: "network", uncertain: true });
    expect(p.consumer.request).toHaveBeenCalledTimes(1);
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.credential).not.toHaveBeenCalled();
  });
  it("enforces the caller's deadline while bootstrap acquisition is still outstanding", async () => {
    vi.useFakeTimers();
    const p = provider(),
      f = transport();
    vi.mocked(p.runtime.acquire).mockImplementation(() => new Promise(() => undefined));
    const result = f.client
      .request("sessions.list", { projectId: "project-a" }, { timeoutMs: 1_000 })
      .catch((error) => error);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await result).toMatchObject({ kind: "timeout", uncertain: false });
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(p.consumer.request).not.toHaveBeenCalled();
  });
  it("retains authenticated HTTP descriptor discovery and publishes only public bootstrap", async () => {
    const p = provider(),
      f = transport();
    const descriptor = {
      protocolVersion: 1,
      environmentId: machine.environmentId,
      name: "Host",
      providers: ["codex"],
      capabilities: machine.capabilities,
    };
    f.fetcher.mockResolvedValue(
      new Response(JSON.stringify({ result: descriptor }), { status: 200 }),
    );
    expect(await f.client.describe()).toEqual(descriptor);
    expect(p.runtime.remember).toHaveBeenCalledWith(
      expect.objectContaining({ id: machine.id }),
      descriptor,
    );
    expect(p.runtime.acquire).not.toHaveBeenCalled();
    expect(f.credential).toHaveBeenCalledTimes(1);
  });
  it("fails explicitly when a capable cohort lacks its native provider", async () => {
    const f = transport();
    await expect(
      f.client.request("sessions.list", { projectId: "project-a" }),
    ).rejects.toMatchObject({ kind: "unsupported", uncertain: false });
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.credential).not.toHaveBeenCalled();
  });
  it("keeps initial pairing discovery outside saved-machine native trust registration", async () => {
    const p = provider();
    const descriptor = {
      protocolVersion: 1,
      environmentId: machine.environmentId,
      name: "Host",
      providers: ["codex"],
      capabilities: machine.capabilities,
    };
    const transient = new HostTransport(
      { ...machine, id: "pairing", environmentId: "", capabilities: [] },
      async () => "a".repeat(43),
      async () => new Response(JSON.stringify({ result: descriptor })),
    );
    cleanups.push(() => transient.dispose());
    expect(await transient.describe()).toEqual(descriptor);
    expect(p.runtime.remember).not.toHaveBeenCalled();
  });
  it("commits a stream before advancing its resume cursor and uses a fresh identity for resnapshot", async () => {
    const p = provider();
    let deliver!: Parameters<HostWsConsumer["subscribe"]>[0];
    vi.mocked(p.consumer.subscribe).mockImplementation((handler) => {
      deliver = handler;
      return () => undefined;
    });
    vi.mocked(p.consumer.request).mockImplementation(
      async (method, params) =>
        (method === "subscriptions.open"
          ? { subscriptionId: params!.subscriptionId, streamId: "stream-a" }
          : { accepted: true }) as never,
    );
    const client = new HostTransport(
      {
        ...machine,
        capabilities: [...machine.capabilities, "transport.ws.streams.v2"],
      },
      async () => {
        throw new Error("No JS credential read");
      },
    );
    cleanups.push(() => client.dispose());
    let commit!: () => void;
    const applied = new Promise<void>((resolve) => {
      commit = resolve;
    });
    let reset = false;
    await client.observeStream(
      { kind: "session", sessionId: "session-a" },
      async (_event, assertCurrent) => {
        if (reset) return "resync";
        await applied;
        assertCurrent();
        return true;
      },
    );
    await vi.waitFor(() =>
      expect(p.consumer.request).toHaveBeenCalledWith("subscriptions.open", expect.anything()),
    );
    const initial = vi
      .mocked(p.consumer.request)
      .mock.calls.find((call) => call[0] === "subscriptions.open")![1]!.subscriptionId as string;
    const payload = {
      jsonrpc: "2.0" as const,
      method: "subscription.event" as const,
      params: {
        subscriptionId: initial,
        streamId: "stream-a",
        cursor: { epoch: "epoch-a", sequence: 1 },
        kind: "snapshot" as const,
        data: {},
      },
    };
    let settled = false;
    const handled = deliver(payload, () => undefined).then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    commit();
    expect(await handled).toBe(true);
    reset = true;
    expect(
      await deliver(
        {
          ...payload,
          params: {
            ...payload.params,
            kind: "delta",
            cursor: { epoch: "epoch-a", sequence: 2 },
          },
        },
        () => undefined,
      ),
    ).toBe(false);
    await vi.waitFor(() =>
      expect(
        vi.mocked(p.consumer.request).mock.calls.filter((call) => call[0] === "subscriptions.open"),
      ).toHaveLength(2),
    );
    const opened = vi
      .mocked(p.consumer.request)
      .mock.calls.filter((call) => call[0] === "subscriptions.open");
    expect(opened[1]![1]!.subscriptionId).not.toBe(initial);
    expect(opened[1]![1]).not.toHaveProperty("cursor");
  });
});
