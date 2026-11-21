// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePushResponses } from "./use-push";
import { useRestoreLastSession } from "../workspace/last-session";

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(), push: vi.fn(), toast: vi.fn(), selectMachine: vi.fn(), initial: vi.fn(),
  stored: vi.fn(),
  listen: vi.fn(), cached: vi.fn(), clear: vi.fn(),
  security: { status: "unlocked", appState: "active" },
  machines: {
    hydrated: false, connectionPending: false, storageError: null as string | null,
    activeId: null as string | null,
    machines: [] as Array<{ id: string; environmentId: string }>,
  },
}));
vi.mock("expo-router", () => ({ router: { navigate: fixture.navigate, push: fixture.push }, useRootNavigationState: () => ({ key: "ready" }) }));
vi.mock("react-native", () => ({ Linking: { getInitialURL: async () => null } }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: fixture.stored } }));
vi.mock("@/state/queries", () => ({}));
vi.mock("@/state/security", () => ({ useSecurity: (select: (state: unknown) => unknown) => select(fixture.security) }));
vi.mock("@/state/machines", () => ({
  useMachines: Object.assign((select: (state: unknown) => unknown) => select(fixture.machines), {
    getState: () => ({ ...fixture.machines, selectMachine: fixture.selectMachine }),
  }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => ({ showToast: fixture.toast }));
vi.mock("../diagnostics/diagnostic-log", () => ({}));
vi.mock("../permissions/device-permissions", () => ({
  notifications: async () => ({
    addNotificationResponseReceivedListener: fixture.listen,
    getLastNotificationResponseAsync: fixture.initial,
    getLastNotificationResponse: fixture.cached,
    clearLastNotificationResponse: fixture.clear,
  }),
}));
vi.mock("./push-registration", () => ({}));

const response = (sessionId: string) => ({
  actionIdentifier: "default",
  notification: { request: { identifier: sessionId, content: { data: { kind: "finished", sessionId, environmentId: "origin" } } } },
});
function Receiver() {
  usePushResponses();
  return null;
}
function RestoreLastSession() {
  useRestoreLastSession();
  return null;
}
let root: ReturnType<typeof createRoot>;
let tap: (event: ReturnType<typeof response>) => void;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  Object.assign(fixture.security, { status: "unlocked", appState: "active" });
  Object.assign(fixture.machines, { hydrated: false, connectionPending: false, storageError: null, activeId: null, machines: [] });
  fixture.listen.mockImplementation((receive: typeof tap) => { tap = receive; return { remove: vi.fn() }; });
  fixture.selectMachine.mockImplementation((id: string) => { fixture.machines.activeId = id; });
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
const render = () => act(async () => root.render(createElement(Receiver)));

it("keeps the cold tap until saved computers finish hydrating and switching is available", async () => {
  fixture.initial.mockResolvedValue(response("cold"));
  fixture.cached.mockReturnValue(response("cold"));
  await render();
  expect(fixture.navigate).not.toHaveBeenCalled();
  expect(fixture.toast).not.toHaveBeenCalled();
  expect(fixture.clear).not.toHaveBeenCalled();
  Object.assign(fixture.machines, { hydrated: true, connectionPending: true, machines: [{ id: "computer", environmentId: "origin" }] });
  await render();
  expect(fixture.selectMachine).not.toHaveBeenCalled();
  fixture.machines.connectionPending = false;
  await render();
  expect(fixture.selectMachine).toHaveBeenCalledExactlyOnceWith("computer");
  expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith({
    pathname: "/session/[id]", params: { id: "cold", machineId: "computer" },
  });
  expect(fixture.clear).toHaveBeenCalledOnce();
});

it("does not let a late cold response replace a newer live tap", async () => {
  let resolve!: (event: ReturnType<typeof response>) => void;
  fixture.initial.mockReturnValue(new Promise((done) => { resolve = done; }));
  Object.assign(fixture.machines, { hydrated: true, activeId: "computer", machines: [{ id: "computer", environmentId: "origin" }] });
  await render();
  await act(() => tap(response("new")));
  await act(() => resolve(response("old")));
  expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith({
    pathname: "/session/[id]", params: { id: "new", machineId: "computer" },
  });
});

it("waits for unlock and never opens a matching computer from unreadable storage", async () => {
  fixture.initial.mockResolvedValue(response("private"));
  fixture.security.status = "locked";
  Object.assign(fixture.machines, {
    hydrated: true, activeId: "computer", storageError: "Read failed",
    machines: [{ id: "computer", environmentId: "origin" }],
  });
  await render();
  expect(fixture.navigate).not.toHaveBeenCalled();
  expect(fixture.toast).not.toHaveBeenCalled();
  fixture.security.status = "unlocked";
  await render();
  expect(fixture.navigate).not.toHaveBeenCalled();
  expect(fixture.toast).toHaveBeenCalledExactlyOnceWith({
    tone: "warning",
    message: "Saved computers could not be loaded, so this notification could not be opened.",
  });
});

it("acknowledges only the response it handles and leaves a newer native response intact", async () => {
  const first = response("first");
  const second = response("second");
  fixture.initial.mockResolvedValue(first);
  fixture.cached.mockReturnValue(second);
  Object.assign(fixture.machines, { hydrated: true, activeId: "computer", machines: [{ id: "computer", environmentId: "origin" }] });
  await render();
  expect(fixture.clear).not.toHaveBeenCalled();
  await act(() => tap(second));
  expect(fixture.clear).toHaveBeenCalledOnce();
  expect(fixture.navigate).toHaveBeenLastCalledWith({
    pathname: "/session/[id]", params: { id: "second", machineId: "computer" },
  });
});

it("does not replay the consumed response when the receiver starts again", async () => {
  let cached: ReturnType<typeof response> | null = response("once");
  fixture.initial.mockImplementation(async () => cached);
  fixture.cached.mockImplementation(() => cached);
  fixture.clear.mockImplementation(() => { cached = null; });
  Object.assign(fixture.machines, { hydrated: true, activeId: "computer", machines: [{ id: "computer", environmentId: "origin" }] });
  await render();
  await act(() => root.unmount());
  root = createRoot(document.createElement("div"));
  await render();
  expect(fixture.navigate).toHaveBeenCalledOnce();
  expect(fixture.clear).toHaveBeenCalledOnce();
});

it("does not restore a stored session over a notification already consumed before the workspace mounts", async () => {
  let cached: ReturnType<typeof response> | null = response("destination");
  fixture.initial.mockImplementation(async () => cached);
  fixture.cached.mockImplementation(() => cached);
  fixture.clear.mockImplementation(() => { cached = null; });
  fixture.stored.mockResolvedValue(JSON.stringify({ machineId: "computer", projectId: "p", id: "stored" }));
  Object.assign(fixture.machines, { hydrated: true, activeId: "computer", machines: [{ id: "computer", environmentId: "origin" }] });
  await render();
  expect(fixture.navigate).toHaveBeenCalledOnce();
  expect(fixture.clear).toHaveBeenCalledOnce();

  await act(async () => root.render(createElement(RestoreLastSession)));
  expect(fixture.push).not.toHaveBeenCalled();
});
