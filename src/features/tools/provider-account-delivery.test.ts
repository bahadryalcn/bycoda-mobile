// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  records: new Map<string, string>(),
  fail: false,
  endpoint: "http://host",
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
      state.records.set(k, v);
    },
    removeItem: async (k: string) => {
      state.records.delete(k);
    },
  },
}));
vi.mock("@/state/queries", () => ({ useHostClient: () => client }));
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
    capabilities: ["providers.desktop.metadata.v1", "providers.desktop.quotaRefresh.v1"],
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
    { machineId: "machine", sessionId: "session" },
    "project",
    report,
    account,
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
  state.fail = false;
  state.endpoint = "http://host";
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
