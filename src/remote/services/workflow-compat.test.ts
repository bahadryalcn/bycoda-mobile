import { afterEach, expect, it, vi } from "vitest";
import {
  HOST_RPC_METHODS,
  getHostRpcMethod,
  parseHostRpcParams,
  WS_LIMITS,
} from "../../../../src/shared/model/host-contracts";
import { parseHostAutomation } from "../../../../src/features/automations/model/hostAutomations";
import { HostTransport } from "../host-transport";
import { MobileHostWsConnection, type HostWsRequestOptions } from "../ws-connection";
import { binding, fakeNative } from "../ws-connection.test-fixture";
import { registerHostWsRuntimeProvider, type HostWsConsumer } from "../ws-runtime-port";
import { mobileWsMethodEnabled } from "../lan-ws";
import { utf8Bytes } from "../transport-validation";
import { createRemoteApi } from "../api";
import {
  automation,
  automationRun,
  sprint,
  sprintFields,
  sprintBoard,
  sprintReport,
  sprintPlan,
  sprintSource,
  sprintContext,
} from "./workflow.test-fixture";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
const machine = {
  id: binding.machineId,
  environmentId: binding.environmentId,
  endpoint: "https://host.example",
  name: "Host",
};
const workflowMethods = Object.keys(HOST_RPC_METHODS).filter(
  (method) => method.startsWith("sprints.") || method.startsWith("automations."),
);
const capabilities = ["transport.ws.sprints.v2", "transport.ws.automations.v2"];
const proposalInput = {
  operationId: "retained-proposal",
  request: "Review the project daily at 09:15",
  projectId: "project",
  currentExecution: { harness: "codex", model: "model", modelSettings: { effort: "high" } },
};
const proposal = {
  operationId: proposalInput.operationId,
  projectId: proposalInput.projectId,
  name: "Daily review",
  instruction: "Review the project",
  schedule: { scheduleKind: "daily", minute: 15, time: "09:15", dayOfWeek: 1 },
  timeZone: "UTC",
  outputTarget: "projectTask",
  confirmationRequired: true,
  preview: { timeZone: "UTC", nextRunAt: 5 },
};

async function connected(extraMethods: string[] = [], extraCapabilities: string[] = []) {
  const enabledCapabilities = [...capabilities, ...extraCapabilities];
  const f = fakeNative({
    methods: [...workflowMethods, ...extraMethods],
    capabilities: enabledCapabilities,
  });
  const connection = new MobileHostWsConnection(
    f.native,
    binding,
    await f.native.acquireCredential(binding),
    1,
    "workflow-test",
  );
  await connection.start();
  cleanups.push(() => connection.close());
  const replies: Record<string, unknown> = {
    "sprints.list": sprintBoard,
    "sprints.get": sprint,
    "sprints.report": sprintReport,
    "sprints.create": sprint,
    "sprints.update": sprint,
    "sprints.start": sprint,
    "sprints.complete": sprint,
    "sprints.archive": sprint,
    "sprints.plan": sprintPlan,
    "sprints.ingest": sprintSource,
    "sprints.goalContext": sprintContext,
    "automations.list": [automation],
    "automations.preview": { timeZone: "UTC", nextRunAt: 5 },
    "automations.propose": proposal,
    "automations.save": automation,
    "automations.delete": { deleted: true },
    "automations.runs": [automationRun],
    "automations.runNow": automationRun,
    "files.write": null,
  };
  f.respond((request) => replies[request.method]);
  const consumer: HostWsConsumer = {
    supports: (method) => connection.supports(method),
    request: <T>(
      method: string,
      params?: Record<string, unknown>,
      options?: HostWsRequestOptions,
    ) => connection.request<T>(method, params, options),
    subscribe: () => () => {},
    state: () => "ready",
    onState: () => () => {},
    release: vi.fn(),
  };
  const acquire = vi.fn(async () => consumer);
  cleanups.push(registerHostWsRuntimeProvider({ acquire, remember: vi.fn() }));
  const credential = vi.fn(async () => "a".repeat(43));
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify({ result: sprint }), { status: 200 }));
  const client = new HostTransport(
    { ...machine, capabilities: enabledCapabilities },
    credential,
    fetcher,
  );
  cleanups.push(() => client.dispose());
  return { ...f, client, acquire, credential, fetcher };
}

it("sends all 11 Sprint and seven Automation methods through the negotiated subset without regenerating caller IDs", async () => {
  const f = await connected();
  const sprintCalls: Array<[string, Record<string, unknown>]> = [
    ["sprints.list", {}],
    ["sprints.get", { id: "sprint" }],
    ["sprints.report", { id: "sprint" }],
    ["sprints.create", { input: { ...sprintFields, id: "sprint", requestId: "retained-create" } }],
    [
      "sprints.update",
      {
        id: "sprint",
        input: {
          requestId: "retained-update",
          expectedRevision: 1,
          goal: null,
          startsAt: null,
          endsAt: null,
          capacityPoints: null,
        },
      },
    ],
    [
      "sprints.start",
      { id: "sprint", input: { requestId: "retained-start", expectedRevision: 1 } },
    ],
    [
      "sprints.complete",
      {
        id: "sprint",
        input: {
          requestId: "retained-complete",
          expectedRevision: 1,
          rollover: { taskKeys: ["task-key"], targetSprintId: null },
        },
      },
    ],
    [
      "sprints.archive",
      { id: "sprint", input: { requestId: "retained-archive", expectedRevision: 1 } },
    ],
    [
      "sprints.plan",
      {
        input: {
          environmentId: binding.environmentId,
          projectId: "project",
          taskId: "task",
          requestId: "retained-plan",
          expectedRevision: 1,
          sprintId: null,
          storyPoints: null,
        },
      },
    ],
    [
      "sprints.ingest",
      {
        input: {
          environmentId: binding.environmentId,
          snapshot: {
            tasks: [
              { id: "task", projectId: "project", title: "Task", status: "todo", updatedAt: 2 },
            ],
            cursor: 1,
            historyAvailableFrom: 0,
          },
          events: [
            {
              sequence: 1,
              projectId: "project",
              taskId: "task",
              status: "todo",
              effectiveAt: 2,
              deleted: false,
            },
          ],
          cursor: 1,
          fromCursor: 0,
          visibleProjectIds: ["project"],
          caughtUp: true,
        },
      },
    ],
    [
      "sprints.goalContext",
      {
        input: {
          environmentId: binding.environmentId,
          goalId: "goal",
          sprintId: null,
          requestId: "retained-context",
          expectedRevision: 1,
        },
      },
    ],
  ];
  for (const [method, params] of sprintCalls) {
    expect(mobileWsMethodEnabled(["transport.ws.sprints.v2"], method)).toBe(true);
    await f.client.request(method, params);
    const sent = f.sent.at(-1)!;
    expect(sent.method).toBe(method);
    expect(sent.params).toEqual(params);
    if (params.input && typeof params.input === "object" && "requestId" in params.input)
      expect((sent.params.input as Record<string, unknown>).requestId).toBe(params.input.requestId);
  }
  const api = createRemoteApi(f.client);
  await api.automations.preview({ scheduleKind: "daily", minute: 15, time: "09:15", dayOfWeek: 1 });
  await api.automations.list();
  const editedAutomation = { ...automation, enabled: false, expectedConfiguration: automation };
  await api.automations.save(editedAutomation);
  await api.automations.delete(automation.id);
  await api.automations.runs(automation.id);
  await api.automations.runNow(automation.id);
  expect(await f.client.request("automations.propose", proposalInput)).toEqual(proposal);
  const calls = f.sent.filter((request) => request.method !== "connection.hello");
  expect(calls).toHaveLength(18);
  expect(new Set(calls.map((request) => request.method))).toEqual(new Set(workflowMethods));
  expect(calls.find((request) => request.method === "automations.propose")?.params).toEqual(proposalInput);
  const save = calls.find((request) => request.method === "automations.save")!;
  expect(save.params).toEqual({
    automation: { ...automation, enabled: false, expectedConfiguration: automation },
  });
  expect(mobileWsMethodEnabled(["transport.ws.automations.v2"], "automations.save")).toBe(true);
  expect(mobileWsMethodEnabled(["transport.ws.sprints.v2"], "automations.save")).toBe(false);
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(f.credential).not.toHaveBeenCalled();
  expect(f.acquire).toHaveBeenCalledTimes(1);
});

it("retains an HTTP-originated Sprint plan command ID and raw values when WS canonicalizes property order", async () => {
  const f = await connected();
  const retained = {
    storyPoints: null,
    sprintId: null,
    expectedRevision: 1,
    requestId: "retained-http-plan",
    taskId: "task",
    projectId: "project",
    environmentId: binding.environmentId,
  };
  const legacy = new HostTransport({ ...machine, capabilities: [] }, f.credential, f.fetcher);
  cleanups.push(() => legacy.dispose());
  await legacy.request("sprints.plan", { input: retained });
  const http = JSON.parse(f.fetcher.mock.calls[0]![1]!.body as string);
  expect(f.acquire).not.toHaveBeenCalled();
  expect(f.sent).toHaveLength(1);
  await f.client.request("sprints.plan", { input: retained });
  const ws = f.sent.at(-1)!;
  expect(http.params.input).toStrictEqual(ws.params.input);
  expect((ws.params.input as Record<string, unknown>).requestId).toBe("retained-http-plan");
  expect(JSON.stringify(http.params.input)).not.toBe(JSON.stringify(ws.params.input));
  expect(ws.method).toBe("sprints.plan");
  expect(f.sent.filter((request) => request.method === "sprints.plan")).toHaveLength(1);
});

it("keeps owner-accepted legacy Automation metadata/boolean variants on original HTTP before acquiring native WS", async () => {
  const acquire = vi.fn();
  cleanups.push(registerHostWsRuntimeProvider({ acquire, remember: vi.fn() }));
  const variant = {
    ...automation,
    createdAt: -1,
    enabled: null,
    expectedConfiguration: { ...automation, createdAt: -1 },
  };
  expect(() => parseHostRpcParams("automations.save", { automation: variant })).toThrow();
  expect(() =>
    parseHostRpcParams("automations.save", {
      automation: {
        ...automation,
        expectedConfiguration: { ...automation, futureOwnerVariant: true },
      },
    }),
  ).toThrow();
  expect(parseHostAutomation(variant)).toMatchObject({
    id: automation.id,
    enabled: true,
    maxRunMinutes: 20,
  });
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify({ result: automation }), { status: 200 }));
  const client = new HostTransport(
    { ...machine, capabilities: ["transport.ws.automations.v2"] },
    async () => "a".repeat(43),
    fetcher,
  );
  cleanups.push(() => client.dispose());
  await client.request("automations.save", { automation: variant });
  expect(acquire).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
  const frame = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
  expect([frame.version, frame.environmentId, frame.method]).toEqual([
    1,
    binding.environmentId,
    "automations.save",
  ]);
  expect(JSON.stringify(frame.params) === JSON.stringify({ automation: variant })).toBe(true);
});

it("keeps actual custom-minute/run-limit inputs aligned with the owner integer policy rather than scheduler-only clamps", () => {
  for (const [maxRunMinutes, maxRunsPerDay] of [
    [0, 0],
    [47, 3],
    [10_080, 1_000],
  ]) {
    const value = { ...automation, maxRunMinutes, maxRunsPerDay };
    expect(parseHostRpcParams("automations.save", { automation: value })).toStrictEqual({
      automation: value,
    });
    expect(parseHostAutomation(value)).toMatchObject({ maxRunMinutes, maxRunsPerDay });
  }
  for (const maxRunMinutes of [-1, 1.5, 10_081]) {
    const value = { ...automation, maxRunMinutes };
    expect(() => parseHostRpcParams("automations.save", { automation: value })).toThrow();
    expect(() => parseHostAutomation(value)).toThrow();
  }
});

it.each([
  ["ASCII", "a".repeat(600 * 1024), "b".repeat(600 * 1024)],
  ["JSON quotes", '"'.repeat(300 * 1024), '"'.repeat(300 * 1024)],
  ["multibyte", "😀".repeat(150 * 1024), "😀".repeat(150 * 1024)],
])(
  "keeps a valid per-file owner CAS outside the WS envelope byte budget on original HTTP (%s)",
  async (_label, expected, content) => {
    const params = { projectId: "project", path: "file", expected, content };
    expect(utf8Bytes(expected)).toBeLessThanOrEqual(1024 * 1024);
    expect(utf8Bytes(content)).toBeLessThanOrEqual(1024 * 1024);
    expect(getHostRpcMethod("files.write")!.paramsSchema.safeParse(params).success).toBe(true);
    expect(
      utf8Bytes(
        JSON.stringify({ jsonrpc: "2.0", id: "x".repeat(200), method: "files.write", params }),
      ),
    ).toBeGreaterThan(WS_LIMITS.maxMessageBytes);
    const acquire = vi.fn();
    cleanups.push(registerHostWsRuntimeProvider({ acquire, remember: vi.fn() }));
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ result: null }), { status: 200 }));
    const client = new HostTransport(
      { ...machine, capabilities: ["transport.ws.files.v2"] },
      async () => "a".repeat(43),
      fetcher,
    );
    cleanups.push(() => client.dispose());
    await client.request("files.write", params);
    expect(acquire).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const frame = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect([frame.version, frame.environmentId, frame.method]).toEqual([
      1,
      binding.environmentId,
      "files.write",
    ]);
    expect(JSON.stringify(frame.params) === JSON.stringify(params)).toBe(true);
  },
);

it("keeps valid multibyte/escaped file CAS below the envelope budget on modern WS", async () => {
  const f = await connected(["files.write"], ["transport.ws.files.v2"]);
  const params = {
    projectId: "project",
    path: "file",
    expected: "😀".repeat(50 * 1024),
    content: '"'.repeat(50 * 1024),
  };
  expect(
    utf8Bytes(
      JSON.stringify({ jsonrpc: "2.0", id: "x".repeat(200), method: "files.write", params }),
    ),
  ).toBeLessThan(WS_LIMITS.maxMessageBytes);
  expect(await f.client.request("files.write", params)).toBeNull();
  expect(f.sent.at(-1)!.method).toBe("files.write");
  expect(f.sent.at(-1)!.params).toStrictEqual(params);
  expect(f.fetcher).not.toHaveBeenCalled();
  expect(f.credential).not.toHaveBeenCalled();
});
