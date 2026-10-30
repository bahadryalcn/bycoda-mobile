import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  exportHostContractManifest,
  getHostRpcMethod,
  parseHostRpcParams,
  hostRpcWireMethod,
  MethodNameSchema,
  ConnectionHelloResultSchema,
  nativeDesktopMethod,
} from "../../../src/shared/model/host-contracts";
import { createContentApi } from "./services/content-api";
import { createTerminalApi } from "./services/terminal-api";
import { createWorkspaceApi } from "./services/workspace-api";
import { createWorkApi } from "./services/work-api";
import { taskInput, persistedTask } from "./services/workflow.test-fixture";
import { mobileWsMethodEnabled, selectMobileHostTransport } from "./lan-ws";
import { MobileHostWsConnection } from "./ws-connection";
import { binding, fakeNative } from "./ws-connection.test-fixture";
import type { HostRequest, MobileNoteInput, HostGoalInput } from "./types";

const generated = JSON.parse(
  readFileSync(
    new URL("../../../src/shared/model/host-contracts/generated/manifest.json", import.meta.url),
    "utf8",
  ),
) as {
  wireVersion: number;
  schemaVersion: number;
  schemaHash: string;
  methods: Record<string, { requiredCapability: string | null; retry: string; kind: string }>;
};
// Private Native workspace/gateway methods are desktop-only by contract: mobile
// never routes them, so their capabilities alone must not opt a Host into WSS.
const mobileMethods = Object.entries(generated.methods).filter(([name]) => !nativeDesktopMethod(name));
const desktopOnlyMethods = Object.keys(generated.methods).filter((name) => nativeDesktopMethod(name));
const capabilitiesOf = (entries: [string, { requiredCapability: string | null }][]) => [
  ...new Set(entries.flatMap(([, method]) => (method.requiredCapability ? [method.requiredCapability] : []))),
];
const connections: MobileHostWsConnection[] = [];
afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
});

describe("mobile compatibility with the generated Host registry", () => {
  it("validates declared Tasks and Goals params and full persisted Task results while rejecting unknown variants", async () => {
    const calls: string[] = [];
    const request: HostRequest = async (method, params) => {
      const wire = hostRpcWireMethod(method),
        value = JSON.parse(JSON.stringify(params ?? {}));
      expect(parseHostRpcParams(wire, value)).toEqual(value);
      calls.push(wire);
      return undefined as never;
    };
    const work = createWorkApi(request);
    const task = taskInput;
    await work.tasks.list("project");
    await work.tasks.save(task);
    await work.tasks.move("task", "queued");
    await work.tasks.recheckReview("task");
    await work.tasks.readNotes("task", ["note"]);
    await work.tasks.resolveNote("task", "note", true);
    await work.tasks.delete("task", false);
    for (const [method, params] of [
      ["tasks.snapshotWithCursor", {}],
      ["tasks.events", { after: 0, limit: 128 }],
      ["tasks.start", { taskId: "task" }],
      ["tasks.reorder", { taskIds: ["task"] }],
      [
        "tasks.retarget",
        {
          taskId: "task",
          workspace: {
            checkoutCwd: "/project",
            baseBranch: "main",
            branchName: "task/owner",
          },
          autoMerge: false,
        },
      ],
      ["tasks.preflight", { task }],
      [
        "tasks.evaluation.save",
        {
          taskId: "task",
          evaluation: { accepted: true, reviewMinutes: 2, corrections: 0 },
          expectedUpdatedAt: 1,
        },
      ],
    ] as const)
      await request(method, params);
    const goal: HostGoalInput = {
      id: "goal",
      title: "Owner goal",
      prompt: "Deliver",
      projectIds: ["project"],
      leadProjectId: "project",
      harness: "codex",
      model: "model",
      modelSettings: {},
      runtimeMode: "supervised",
      maxRunMinutes: 20,
      verifyDefaults: { review: true },
      approvePlan: false,
    };
    await work.goals.list();
    await work.goals.create(goal);
    await work.goals.approve("goal");
    await work.goals.update(
      "goal",
      {
        autoMerge: false,
        continueUntilDone: true,
        maxRunningTasks: 2,
        maxRunMinutes: 20,
      },
      1,
    );
    await work.goals.replan("goal", "Owner feedback");
    await work.goals.cancel("goal");
    await request("goals.delete", { goalId: "goal", withTasks: false });
    await request("goals.final-review.recheck", {
      goalId: "goal",
      expectedUpdatedAt: 1,
    });
    expect(calls).toHaveLength(22);
    expect(new Set(calls)).toEqual(
      new Set(
        Object.keys(generated.methods).filter(
          (method) => method.startsWith("tasks.") || method.startsWith("goals."),
        ),
      ),
    );
    const extended = {
      ...task,
      futureOwnerVariant: { nested: [null, true, { retained: "yes" }] },
    };
    expect(() => parseHostRpcParams("tasks.save", { task: extended })).toThrow();
    expect(() => getHostRpcMethod("tasks.save")!.resultSchema.parse(extended)).toThrow();
    const result = getHostRpcMethod("tasks.save")!.resultSchema;
    expect(() => result.parse(task)).toThrow(); // An editable input is not a persisted Task result.
    expect(result.parse(persistedTask)).toStrictEqual(persistedTask);
    for (const status of [
      "todo",
      "queued",
      "running",
      "verifying",
      "review",
      "done",
      "blocked",
    ] as const)
      expect(result.parse({ ...persistedTask, status })).toStrictEqual({
        ...persistedTask,
        status,
      });
    const { status: _status, ...configuration } = persistedTask;
    const edited = {
      ...configuration,
      title: "New owner title",
      expectedConfiguration: persistedTask,
    };
    expect(parseHostRpcParams("tasks.save", { task: edited })).toStrictEqual({
      task: edited,
    });
    const clearReviewer = {
      ...configuration,
      reviewerConfig: null,
      expectedConfiguration: persistedTask,
    };
    expect(parseHostRpcParams("tasks.save", { task: clearReviewer })).toStrictEqual({
      task: clearReviewer,
    });
    expect(() => result.parse({ ...persistedTask, reviewerConfig: null })).toThrow();
    for (const invalid of [
      { ...persistedTask, futureOwnerVariant: true },
      { ...persistedTask, status: "unknown-status" },
      {
        ...persistedTask,
        workspace: { ...persistedTask.workspace, futureOwnerVariant: true },
      },
      {
        ...persistedTask,
        evaluation: { ...persistedTask.evaluation, futureOwnerVariant: true },
      },
      {
        ...persistedTask,
        verification: {
          command: {
            exitCode: null,
            output: "",
            timedOut: false,
            futureOwnerVariant: true,
          },
        },
      },
    ])
      expect(() => result.parse(invalid)).toThrow();
    expect(() => parseHostRpcParams("tasks.save", { task, unknownOuter: true })).toThrow();
    expect(() =>
      parseHostRpcParams("tasks.save", {
        task: { ...task, invalid: () => undefined },
      }),
    ).toThrow();
  });
  it("keeps the old wire-name grammar and recognizes only the explicit client alias", () => {
    const legacy = "goals.final-review.recheck",
      canonical = "goals.finalReview.recheck";
    expect(hostRpcWireMethod(legacy)).toBe(canonical);
    expect(generated.methods[legacy]).toBeUndefined();
    expect(MethodNameSchema.safeParse(legacy).success).toBe(false);
    expect(MethodNameSchema.safeParse(canonical).success).toBe(true);
    const hello = {
      environmentId: binding.environmentId,
      wireVersion: 2,
      schemaVersion: 1,
      connectionId: "server",
      capabilities: ["transport.ws.goals.v2"],
      methods: [legacy],
    };
    expect(ConnectionHelloResultSchema.safeParse(hello).success).toBe(false);
    expect(ConnectionHelloResultSchema.safeParse({ ...hello, methods: [canonical] }).success).toBe(
      true,
    );
    for (const unknown of [
      "constructor",
      "goals.final--review.recheck",
      "goals.finalReview.unknown",
    ]) {
      expect(hostRpcWireMethod(unknown)).toBe(unknown);
      expect(getHostRpcMethod(unknown)).toBeUndefined();
      expect(mobileWsMethodEnabled(["transport.ws.goals.v2"], unknown)).toBe(false);
    }
  });
  it("validates real Notes, terminal, Git and project API params with the same closed manifest", async () => {
    const { schemaHash, ...manifest } = generated;
    const source = exportHostContractManifest();
    expect(source).toEqual(manifest);
    expect(createHash("sha256").update(JSON.stringify(source)).digest("hex")).toBe(schemaHash);
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const request: HostRequest = async (method, params) => {
      // This is the existing adapter's optional-undefined JSON boundary.
      const wire = JSON.parse(JSON.stringify(params ?? {}));
      expect(parseHostRpcParams(method, wire)).toEqual(wire);
      calls.push({ method, params: wire });
      return undefined as never;
    };
    const projects = createWorkspaceApi(request).projects;
    await projects.list();
    await projects.directory();
    await projects.browse(undefined);
    await projects.browse("C:/Projects");
    await projects.createDirectory("C:/Projects", "new-project");
    await projects.open("C:/Projects/source");
    const terminal = createTerminalApi(request);
    const requestId = "4d2f47ed-5270-4d62-b81d-4015cb31dbba";
    await terminal.terminalList("project-a");
    await terminal.terminalRead("project-a", "terminal-a", 123);
    await terminal.terminalCreate({
      projectId: "project-a",
      requestId,
      name: undefined,
      profileId: "pwsh",
    });
    await terminal.terminalWrite("project-a", "terminal-a", "echo Türkçe 😀\n");
    await terminal.terminalInterrupt("project-a", "terminal-a");
    await terminal.terminalClose("project-a", "terminal-a");
    const git = createWorkspaceApi(request).git;
    const target = { projectId: "project-a", cwd: "C:/Projects/source" };
    await git.index(target);
    await git.fileDiff(target, "src/file.ts", false);
    await git.action(target, "commit", { message: "Owner intent" });
    await git.branches(target);
    await git.switchBranch(target, "feature", "origin");
    await git.createBranch(target, "new-branch");
    await git.worktrees("project-a");
    await git.createWorktree(target, "feature", "origin/main", false);
    const notes = createContentApi(request).notes;
    const note: MobileNoteInput = {
      id: "note-a",
      title: "Reviewed",
      body: "Owner prose",
      tags: ["work"],
      sourceSessionId: "session-a",
      sourceCwd: target.cwd,
      expectedUpdatedAt: 7,
      finalizeSlug: true,
    };
    await notes.list("project-a");
    await notes.get("note-a");
    await notes.save(note, 7);
    await notes.delete("note-a", 7);
    expect(calls).toHaveLength(24);
    expect(calls.find((call) => call.method === "terminals.create")!.params.requestId).toBe(
      requestId,
    );
    expect(calls.find((call) => call.method === "git.switch")!.params.remote).toBe("origin");
    const save = calls.find((call) => call.method === "notes.upsert")!.params;
    for (const extra of [
      "slug",
      "slugPending",
      "createdAt",
      "updatedAt",
      "contentUpdatedAt",
      "preview",
      "projectId",
    ])
      expect(() =>
        parseHostRpcParams("notes.upsert", {
          ...save,
          note: { ...note, [extra]: 1 },
        }),
      ).toThrow();
  });
  it("derives native subset recognition from all actual per-method capabilities and ignores unknown future markers", () => {
    const mobileCapabilities = capabilitiesOf(mobileMethods);
    for (const capability of mobileCapabilities)
      expect(selectMobileHostTransport([capability], true)).toBe(
        capability === "transport.ws.read.v2" ? "legacy-http" : "native-wss",
      );
    // A capability carried only by desktop-only Native methods keeps legacy HTTP.
    for (const capability of capabilitiesOf(
      Object.entries(generated.methods).filter(([name]) => nativeDesktopMethod(name)),
    ).filter((capability) => !mobileCapabilities.includes(capability)))
      expect(selectMobileHostTransport([capability], true)).toBe("legacy-http");
    expect(selectMobileHostTransport(["transport.ws.read.v2"], false)).toBe("legacy-http");
    expect(
      mobileWsMethodEnabled(["transport.ws.sessions.v2", "transport.ws.read.v2"], "projects.list"),
    ).toBe(true);
    expect(mobileWsMethodEnabled(["transport.ws.sessions.v2"], "projects.list")).toBe(false);
    expect(selectMobileHostTransport(["transport.ws.future.v999"], true)).toBe("legacy-http");
    expect(selectMobileHostTransport(["transport.ws.v2"], true)).toBe("native-wss");
  });
  it.each([
    ["transport.ws.terminals.v2", "terminals.create"],
    ["transport.ws.git.v2", "git.switch"],
    ["transport.ws.notes.v2", "notes.upsert"],
    ["transport.ws.stewards.v2", "stewards.save"],
    ["transport.ws.crews.v2", "crews.save"],
  ])(
    "recognizes the %s subset cohort and keeps method admission explicit",
    (capability, method) => {
      expect(selectMobileHostTransport([capability], true)).toBe("native-wss");
      expect(() => selectMobileHostTransport([capability], false)).toThrow(/native/);
      expect(mobileWsMethodEnabled([capability], method)).toBe(true);
      expect(mobileWsMethodEnabled([], method)).toBe(false);
      expect(getHostRpcMethod(method)?.retry).toBe("never");
    },
  );
  it("negotiates the generated versions/methods and requires both capability and actual hello route", async () => {
    const methods = Object.keys(generated.methods);
    const capabilities = capabilitiesOf(Object.entries(generated.methods));
    const f = fakeNative({ methods, capabilities });
    const connection = new MobileHostWsConnection(
      f.native,
      binding,
      await f.native.acquireCredential(binding),
      1,
      "registry-test",
    );
    connections.push(connection);
    await connection.start();
    expect(f.sent[0]!.params.supportedWireVersions).toEqual([generated.wireVersion]);
    expect(f.sent[0]!.params.supportedSchemaVersions).toEqual([generated.schemaVersion]);
    for (const [method] of mobileMethods) expect(connection.supports(method)).toBe(true);
    // Even when the Host advertises them, desktop-only Native methods are never routed from mobile.
    expect(desktopOnlyMethods.length).toBeGreaterThan(0);
    for (const method of desktopOnlyMethods) expect(connection.supports(method)).toBe(false);
    const reduced = fakeNative({
      methods: ["notes.list"],
      capabilities: ["transport.ws.notes.v2"],
    });
    const subset = new MobileHostWsConnection(
      reduced.native,
      binding,
      await reduced.native.acquireCredential(binding),
      2,
      "subset-test",
    );
    connections.push(subset);
    await subset.start();
    expect(subset.supports("notes.list")).toBe(true);
    expect(subset.supports("notes.upsert")).toBe(false);
    expect(subset.supports("git.switch")).toBe(false);
    await expect(
      subset.request("notes.upsert", {
        note: { id: "n", title: "t", body: "b", tags: [] },
      }),
    ).rejects.toMatchObject({ category: "schema", uncertain: false });
    expect(reduced.sent).toHaveLength(1);
  });
});
