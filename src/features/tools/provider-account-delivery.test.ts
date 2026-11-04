// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  records: new Map<string, string>(),
  fail: false,
  metadata: true,
  connected: true,
  pausePersist: undefined as undefined | (() => Promise<void>),
  endpoint: "http://host",
  project: "project",
  session: "session",
  accountId: "default",
  revision: "a".repeat(64),
  request: vi.fn(),
  next: 0,
}));
vi.mock("expo-crypto", () => ({
  randomUUID: () => `operation-${++state.next}`,
  digestStringAsync: async (_alg: string, input: string) =>
    (input.includes("replacement") ? "b" : "a").repeat(64),
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => state.records.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      if (state.fail) throw Error("storage");
      await state.pausePersist?.();
      state.records.set(k, v);
    },
    removeItem: async (k: string) => {
      state.records.delete(k);
    },
  },
}));
vi.mock("@/state/queries", () => ({ useHostClient: () => state.connected ? client : null }));
vi.mock("@/state/machines", () => ({
  useMachines: { getState: () => ({ activeId: "machine", machines: [client.machine] }) },
}));
const client = {
  machine: {
    id: "machine",
    get endpoint() {
      return state.endpoint;
    },
    environmentId: "host",
    get capabilities() { return [...(state.metadata ? ["providers.desktop.metadata.v1"] : []), "providers.desktop.quotaRefresh.v1"]; },
  },
  request: state.request,
};
import { useProviderAccountDelivery } from "./provider-account-delivery";
import type { DesktopManagementReport } from "./provider-desktop-model";
const report = {
  environmentId: "host",
  sourceSessionId: "session",
  projectCwd: "/project",
  workingCwd: "/project",
  accountRevision: "a".repeat(64),
} as DesktopManagementReport;
const account = {
  provider: "claude",
  id: "default",
  label: "Work",
  color: null,
} as DesktopManagementReport["accounts"][number];
const change = { kind: "rename", label: "Renamed" } as const;
let hook: ReturnType<typeof useProviderAccountDelivery>,
  root: ReturnType<typeof createRoot> | undefined;
function Harness() {
  hook = useProviderAccountDelivery(
    { machineId: "machine", sessionId: state.session },
    state.project,
    { ...report, sourceSessionId: state.session, accountRevision: state.revision },
    { ...account, id: state.accountId },
  );
  return null;
}
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
  await act(async () => root!.render(createElement(Harness)));
}
async function unmount() {
  if (root) {
    await act(async () => root!.unmount());
    root = undefined;
  }
}
async function edit() {
  await act(async () => hook.draft.setValue({ ...hook.draft.valueRef.current!, label: "Renamed" }));
}
afterEach(async () => {
  await unmount();
  state.records.clear();
  state.fail = false; state.metadata = true; state.connected = true; state.pausePersist = undefined;
  state.endpoint = "http://host"; state.project = "project"; state.session = "session"; state.accountId = "default"; state.revision = "a".repeat(64);
  state.next = 0;
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
it("persists exact reviewed fields before dispatch and reopens with status only", async () => {
  state.request.mockImplementation(async (method, input) => {
    if (method === "providers.desktop.patch") {
      const saved = JSON.parse([...state.records.values()][0]);
      expect(saved.pending).toMatchObject({
        operationId: input.operationId,
        expectedAccountRevision: report.accountRevision,
        change,
      });
      throw Error("unknown transport");
    }
    return { state: "unknown", atomic: false, operationId: input.operationId };
  });
  await mount();
  await edit();
  await act(async () => hook.submit(change));
  expect(
    state.request.mock.calls.filter(([method]) => method === "providers.desktop.patch"),
  ).toHaveLength(1);
  expect(hook.draft.value?.pending).toBeTruthy();
  await unmount();
  state.request.mockClear();
  await mount();
  expect(state.request.mock.calls.map(([method]) => method)).toEqual(["providers.desktop.status"]);
  await act(async () => hook.submit(change));
  expect(state.request).toHaveBeenCalledTimes(1);
});
it("refuses storage failure and same-id endpoint replacement without RPC", async () => {
  await mount();
  await edit();
  state.fail = true;
  await act(async () => hook.submit(change));
  expect(state.request).not.toHaveBeenCalled();
  state.fail = false;
  await act(async () => hook.draft.persist());
  state.endpoint = "http://replacement";
  await act(async () => hook.submit(change));
  expect(state.request).not.toHaveBeenCalled();
});
it("refuses even a status read after reopening on a replacement endpoint with the same environment", async () => {
  state.request.mockRejectedValue(Error("unknown"));
  await mount();
  await edit();
  await act(async () => hook.submit(change));
  expect(hook.draft.value?.pending).toBeTruthy();
  await unmount();
  state.endpoint = "http://replacement";
  state.request.mockClear();
  await mount();
  expect(state.request).not.toHaveBeenCalled();
  expect(hook.draft.value?.pending).toBeTruthy();
  expect(String(hook.error)).toContain("another paired computer identity");
});
it("only known matching terminal receipts unlock pending, malformed results stay guarded", async () => {
  state.request.mockResolvedValue({ state: "applied", operationId: "wrong", atomic: false });
  await mount();
  await edit();
  await act(async () => hook.submit(change));
  expect(hook.draft.value?.pending).toBeTruthy();
  state.request.mockImplementation(async (_method, input) => ({
    state: "failed",
    operationId: input.operationId,
    atomic: false,
    message: "stale",
  }));
  await act(async () => hook.reconcile());
  expect(hook.draft.value?.pending).toBeUndefined();
  expect(hook.draft.value?.finished).toBe(true);
});
it("explicit quota refresh persists review and calls only the finite read action once", async () => {
  const review = { kind: "quotaRefresh", confirm: "REFRESH_PROVIDER_QUOTA" } as const;
  state.request.mockImplementation(async (method, input) => {
    if (method === "providers.desktop.status")
      return { state: "unknown", atomic: false, operationId: input.operationId };
    expect(method).toBe("providers.desktop.quota.refresh");
    expect(input.confirm).toBe("REFRESH_PROVIDER_QUOTA");
    expect(input.change).toBeUndefined();
    expect(JSON.parse([...state.records.values()][0]).pending.change).toEqual(review);
    return { state: "unknown", atomic: false, operationId: input.operationId };
  });
  await mount();
  await act(async () =>
    hook.draft.setValue({ ...hook.draft.valueRef.current!, kind: "quotaRefresh" }),
  );
  await act(async () => hook.submit(review));
  await act(async () => hook.submit(review));
  expect(
    state.request.mock.calls.filter(([method]) => method === "providers.desktop.quota.refresh"),
  ).toHaveLength(1);
  expect(hook.draft.value?.pending).toBeTruthy();
});

it("does not revive a reviewed write after observing a same-id replacement and return", async () => {
  await mount(); await edit(); state.endpoint = "http://replacement"; await act(async () => root!.render(createElement(Harness)));
  expect(hook.current()).toBe(false); state.endpoint = "http://host"; await act(async () => root!.render(createElement(Harness)));
  await act(async () => hook.submit(change)); expect(state.request).not.toHaveBeenCalled(); expect(hook.draft.value?.label).toBe("Renamed");
});
it.each(["project", "session", "accountId"] as const)("keeps the original draft and retires a review after a %s change", async field => {
  await mount(); await edit(); const oldSubmit = hook.submit; const original = state[field]; state[field] = "other-target";
  await act(async () => root!.render(createElement(Harness))); expect(hook.current()).toBe(false);
  state[field] = original; await act(async () => root!.render(createElement(Harness)));
  await act(async () => oldSubmit(change)); expect(state.request).not.toHaveBeenCalled();
  expect(hook.draft.value?.label).toBe("Renamed"); expect([...state.records.keys()].every(key => !key.includes("other-target"))).toBe(true);
});
it("keeps the opening revision when newer metadata arrives before confirmation", async () => {
  state.request.mockImplementation(async (_method, input) => ({ state: "unknown", atomic: false, operationId: input.operationId }));
  await mount(); await edit(); state.revision = "b".repeat(64); await act(async () => root!.render(createElement(Harness)));
  await act(async () => hook.submit(change)); expect(state.request).toHaveBeenCalledWith("providers.desktop.patch", expect.objectContaining({ expectedAccountRevision: "a".repeat(64), projectId: "project", sessionId: "session", accountId: "default" }));
});

it("rechecks the specific operation capability after draft persistence", async () => {
  await mount(); await edit();
  let release!: () => void, began!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  state.pausePersist = () => { state.pausePersist = undefined; began(); return new Promise<void>(resolve => { release = resolve; }); };
  let sending!: Promise<void>;
  await act(async () => { sending = hook.submit(change); await started; });
  state.metadata = false; await act(async () => { release(); await sending; });
  expect(state.request).not.toHaveBeenCalled(); expect(hook.draft.value?.pending).toBeUndefined(); expect(hook.draft.value?.label).toBe("Renamed");
});

it("preserves an unsent draft across a temporary transport loss for the same identity", async () => {
  state.request.mockImplementation(async (_method, input) => ({ state: "unknown", atomic: false, operationId: input.operationId }));
  await mount(); await edit(); state.connected = false; await act(async () => root!.render(createElement(Harness)));
  expect(hook.current()).toBe(false); expect(hook.draft.value?.label).toBe("Renamed");
  state.connected = true; await act(async () => root!.render(createElement(Harness))); expect(hook.current()).toBe(true);
  await act(async () => hook.submit(change)); expect(state.request.mock.calls.filter(([method]) => method === "providers.desktop.patch")).toHaveLength(1);
  expect(state.request.mock.calls.every(([method]) => ["providers.desktop.patch", "providers.desktop.status"].includes(method))).toBe(true);
});
it("retains the saved pending operation when a late reply follows a retired connection", async () => {
  let reply!: (value: unknown) => void; let input!: { operationId: string };
  state.request.mockImplementation((_method, params) => { input = params; return new Promise(resolve => { reply = resolve; }); });
  await mount(); await edit(); let sending!: Promise<void>;
  await act(async () => { sending = hook.submit(change); });
  expect(hook.draft.value?.pending).toBeTruthy(); state.endpoint = "http://replacement"; await act(async () => root!.render(createElement(Harness)));
  state.endpoint = "http://host"; await act(async () => root!.render(createElement(Harness)));
  await act(async () => { reply({ state: "applied", atomic: false, operationId: input.operationId }); await sending; });
  expect(hook.receipt).toBeUndefined(); expect(hook.draft.value?.pending).toBeTruthy(); expect(hook.draft.value?.finished).not.toBe(true);
});
