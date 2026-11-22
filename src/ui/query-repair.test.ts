// @vitest-environment happy-dom
import { act, createElement, type ComponentProps, type ContextType } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { SheetGuardContext } from "./sheet-guard-context";
import { ConnectionFeedbackScope } from "./connection-feedback-scope";
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./feedback", () => ({ Empty: "Empty", ErrorNotice: "ErrorNotice", Loading: "Loading", Notice: "Notice", Skeleton: "Skeleton" }));
vi.mock("./typography", () => ({ Body: "Body" }));
vi.mock("./state-view", () => ({ StateView: "StateView" }));
vi.mock("./toast", () => ({ showToast: vi.fn(), useToastAvailable: () => false }));
const quiet = vi.hoisted(() => ({ on: false }));
vi.mock("../state/query-retry", async (original) => {
  const actual = await original<typeof import("../state/query-retry")>();
  return { ...actual, isTransientConnectionError: (error: unknown) => quiet.on && actual.isTransientConnectionError(error) };
});
import { QueryState } from "./query-state";
/** QueryState keeps a Skeleton mounted for its hand-off: it is the result only while loading. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test probe reads arbitrary element props
type Rendered = { type: unknown; props: any } | null;
function unwrap(tree: ReturnType<typeof QueryState>): Rendered {
  const children = (tree?.props as { children: Rendered | Rendered[] }).children;
  if (!Array.isArray(children)) return children;
  const [, skeleton, node = null] = children;
  return skeleton?.props.loading ? skeleton : node;
}
function renderQuery(props: ComponentProps<typeof QueryState>, scope?: ContextType<typeof SheetGuardContext>) {
  let result: Rendered = null;
  function Probe() { result = unwrap(QueryState(props)); return null; }
  renderToStaticMarkup(scope ? createElement(SheetGuardContext.Provider, { value: scope }, createElement(Probe)) : createElement(Probe));
  return result as Rendered;
}

import { router } from "expo-router";
import { onlineManager } from "@tanstack/react-query";
import { RemoteHostError } from "../remote/host-error";
import { recordActiveHostDisconnected, recordActiveHostMachine, recordHostRuntimeState, resetHostRuntimeStates } from "../state/host-runtime-state";
beforeEach(() => { vi.clearAllMocks(); quiet.on = false; onlineManager.setOnline(true); resetHostRuntimeStates(); });

it("keeps the reconnect budget when a failed initial read briefly returns to pending", async () => {
  quiet.on = true;
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  const refetch = vi.fn();
  const view = { rendered: null as Rendered };
  function Probe({ query }: { query: ComponentProps<typeof QueryState>["query"] }) {
    view.rendered = unwrap(QueryState({ query, loading: "inline" }));
    return null;
  }
  const render = (query: ComponentProps<typeof QueryState>["query"]) =>
    act(async () => root.render(createElement(Probe, { query })));
  const failed = { error: new RemoteHostError("computer", "timeout", "Timed out"), refetch };
  try {
    await render(failed);
    for (const delay of [3_000, 6_000, 12_000, 15_000]) {
      await act(async () => { await vi.advanceTimersByTimeAsync(delay); });
      await render({ status: "pending", fetchStatus: "fetching", isFetching: true, refetch });
      await render(failed);
    }
    expect(refetch).toHaveBeenCalledTimes(4);
    expect(view.rendered?.props.action?.label).toBe("Retry");
    await render({ data: [], status: "success", refetch });
    await render(failed);
    expect(view.rendered?.props.label).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it("offers Retry for a timed-out read when the selected computer's socket is ready", () => {
  quiet.on = true;
  recordActiveHostMachine("pc");
  recordHostRuntimeState("pc", "ready");
  const refetch = vi.fn();
  const query = { error: new RemoteHostError("pc", "timeout", "Timed out"), refetch };
  const state = renderQuery({ query, loading: "inline" });
  expect(state?.props.title).toBe("The computer took too long to respond");
  expect(state?.props.description).toBeUndefined();
  expect(state?.props.illustration).toBeUndefined();
  expect(state?.props.action?.label).toBe("Retry");
  state?.props.action?.onPress();
  expect(refetch).toHaveBeenCalledOnce();
});

it("keeps two timed-out reads on a reachable Host independently retryable", async () => {
  quiet.on = true;
  recordActiveHostMachine("pc");
  recordHostRuntimeState("pc", "ready");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  const refetches = [vi.fn(), vi.fn()];
  const feedback: Rendered[] = [];
  function Probe({ index }: { index: number }) {
    feedback[index] = unwrap(QueryState({
      query: { error: new RemoteHostError("pc", "timeout", "Timed out"), refetch: refetches[index] },
      loading: "inline",
      shareConnectionFeedback: true,
    }));
    return null;
  }
  try {
    await act(async () => root.render(createElement(ConnectionFeedbackScope, { sharedReads: true },
      createElement(Probe, { index: 0 }), createElement(Probe, { index: 1 }),
    )));
    for (const state of feedback) expect(state?.props.action?.label).toBe("Retry");
    feedback[1]?.props.action?.onPress();
    expect(refetches[0]).not.toHaveBeenCalled();
    expect(refetches[1]).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("uses custom progress only while the query can load", () => {
  const query = { status: "pending", fetchStatus: "fetching", failureCount: 1 } as const;
  const renderLoading = vi.fn((label: string) => createElement("div", { "aria-label": label }));
  const props = { query, loading: "centered", renderLoading } as const;

  expect(renderQuery(props)?.props["aria-label"]).toBe("Loading…");
  onlineManager.setOnline(false);
  expect(renderQuery(props)?.props.illustration).toBe("offline");
  expect(renderLoading).toHaveBeenCalledOnce();
});

it("only explains a retry when recovery lasts six seconds", async () => {
  quiet.on = true;
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  const view = { rendered: null as Rendered };
  const refetch = vi.fn();
  function Probe({ query }: { query: ComponentProps<typeof QueryState>["query"] }) {
    view.rendered = unwrap(QueryState({ query, loading: "inline" }));
    return null;
  }
  const render = (query: ComponentProps<typeof QueryState>["query"]) =>
    act(async () => root.render(createElement(Probe, { query })));
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const failed = { error: new RemoteHostError("pc", "network", "Dropped"), refetch };
  const retry = { status: "pending", fetchStatus: "fetching", failureCount: 1, refetch } as const;
  try {
    await render(retry);
    await advance(4_000);
    expect(view.rendered?.props.label).toBeUndefined();
    await render({ data: [], status: "success", refetch });
    await render(failed);
    await advance(3_000);
    expect(refetch).toHaveBeenCalledOnce();
    await render(retry);
    await advance(2_999);
    expect(view.rendered?.props.label).toBeUndefined();
    await advance(1);
    expect(view.rendered?.props.label).toBe("The computer is slow to answer; trying again…");
    await render({ error: new RemoteHostError("pc", "auth", "Pairing"), refetch });
    expect(view.rendered?.props.action?.label).toBe("Manage connections");
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it("says the computer is unreachable instead of loading while its socket waits to reconnect", () => {
  expect(renderQuery({ query: { status: "pending", fetchStatus: "fetching", isLoading: true } })?.type).toBe("Skeleton");
  recordHostRuntimeState("machine", "backoff");
  // Another computer's dropped link says nothing about the selected one.
  recordActiveHostMachine("other");
  expect(renderQuery({ query: { status: "pending", fetchStatus: "fetching", isLoading: true } })?.type).toBe("Skeleton");
  recordActiveHostMachine("machine");
  expect(renderQuery({ query: { status: "pending", fetchStatus: "fetching", isLoading: true } })?.type).toBe("Skeleton");
  // Without a live socket, the pill's Disconnected verdict already confirms the outage.
  resetHostRuntimeStates();
  recordActiveHostDisconnected(true);
  const waiting = renderQuery({ query: { status: "pending", fetchStatus: "fetching", isLoading: true } });
  expect(waiting?.props.title).toBe("Waiting for a connection");
  expect(waiting?.props.action.label).toBe("Manage connections");
  // Loaded data stays on screen; the pill reports the link.
  expect(renderQuery({ query: { data: [1], status: "success" } })).toBeNull();
});

it.each(["fetching", "paused"] as const)("keeps a brief live socket backoff quiet for a %s read", async (fetchStatus) => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  const view = { rendered: null as Rendered };
  const query = { status: "pending", fetchStatus } as const;
  function Probe() {
    view.rendered = unwrap(QueryState({ query }));
    return null;
  }
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  recordActiveHostMachine("pc");
  recordHostRuntimeState("pc", "backoff");
  try {
    await act(async () => root.render(createElement(Probe)));
    await advance(4_000);
    expect(view.rendered?.type).toBe("Skeleton");
    await act(async () => recordHostRuntimeState("pc", "ready"));
    await advance(2_001);
    expect(view.rendered?.type).toBe(fetchStatus === "fetching" ? "Skeleton" : "StateView");
    await act(async () => recordHostRuntimeState("pc", "backoff"));
    await advance(6_000);
    expect(view.rendered?.props.title).toBe("Waiting for a connection");
    await act(async () => {
      recordHostRuntimeState("new-pc", "backoff");
      recordActiveHostMachine("new-pc");
    });
    expect(view.rendered?.type).toBe("Skeleton");
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it("keeps cached data and offers Refresh after a deadline on a reachable Host", () => {
  quiet.on = true;
  recordActiveHostMachine("pc");
  recordHostRuntimeState("pc", "ready");
  const refetch = vi.fn();
  const query = { data: [1], error: new RemoteHostError("pc", "timeout", "Timed out"), refetch };
  const notice = renderQuery({ query, loading: "inline" });
  expect(notice?.type).toBe("Notice");
  expect(notice?.props.action?.label).toBe("Refresh");
  notice?.props.action?.onPress();
  expect(refetch).toHaveBeenCalledOnce();
  expect(renderQuery({ query: { ...query, fetchStatus: "fetching" }, loading: "inline" })).toBeNull();
});

it("shows offline immediately during an initial fetch and retains an explicit repair error", () => {
  recordActiveHostMachine("machine");
  recordHostRuntimeState("machine", "backoff");
  onlineManager.setOnline(false);
  expect(renderQuery({ query: { status: "pending", fetchStatus: "fetching" } })?.props.illustration).toBe("offline");
  const repair = renderQuery({ query: { error: new RemoteHostError("machine", "auth", "Pairing") } });
  expect(repair?.props.action.label).toBe("Manage connections");
});

it("keeps connection recovery compact inside a settings section", () => {
  recordActiveHostDisconnected(true);
  const waiting = renderQuery({
    query: { status: "pending", fetchStatus: "fetching", isLoading: true },
    loading: "inline",
    compact: true,
  });
  expect(waiting?.props.compact).toBe(true);
  expect(waiting?.props.title).toBe("Waiting for a connection");
  expect(waiting?.props.action.label).toBe("Manage connections");
});

it("shows one centered offline state instead of reconnecting while the device has no network", () => {
  onlineManager.setOnline(false);
  const failed = renderQuery({ query: { error: new RemoteHostError("computer", "network", "down"), refetch: vi.fn() } });
  expect(failed?.props.illustration).toBe("offline");
  expect(failed?.props.title).toBe("You're offline");
  const cached = renderQuery({ query: { data: [1], error: new RemoteHostError("computer", "network", "down"), refetch: vi.fn() } });
  expect(cached).toBeNull();
});

it("uses caller-owned connection recovery for authentication and identity while keeping the default route", () => {
  const recover = vi.fn();
  for (const kind of ["auth", "identity"] as const) {
    const query = { error: new RemoteHostError("machine", kind, "Repair pairing"), status: "error" as const };
    const embedded = renderQuery({ query, onManageConnections: recover });
    expect(embedded!.props.action.onPress).toBe(recover); embedded!.props.action.onPress();
    expect(embedded!.props.action.label).toBe("Manage connections"); expect(embedded!.props.illustration).toBe("locked");
    renderQuery({ query })!.props.action.onPress();
  }
  expect(recover).toHaveBeenCalledTimes(2); expect(router.navigate).toHaveBeenCalledWith("/machines");
});
it("defers default repair to the nearest Sheet approval and does not navigate before it completes", () => {
  const requestCloseThen = vi.fn(), requestClose = vi.fn();
  const scope = { register: vi.fn(), requestClose, requestCloseThen };
  for (const kind of ["auth", "identity"] as const) {
    const view = renderQuery({ query: { error: new RemoteHostError("machine", kind, "Pairing") } }, scope);
    view!.props.action.onPress();
    expect(router.navigate).not.toHaveBeenCalled();
  }
  expect(requestCloseThen).toHaveBeenCalledTimes(2); expect(requestClose).not.toHaveBeenCalled();
  requestCloseThen.mock.calls[1][0](); expect(router.navigate).toHaveBeenCalledExactlyOnceWith("/machines");
});
it("preserves an explicit recovery owner inside a Sheet", () => {
  const requestCloseThen = vi.fn(), recover = vi.fn();
  const view = renderQuery({ query: { error: new RemoteHostError("machine", "auth", "Pairing") }, onManageConnections: recover },
    { register: vi.fn(), requestClose: vi.fn(), requestCloseThen });
  view!.props.action.onPress(); expect(recover).toHaveBeenCalledOnce(); expect(requestCloseThen).not.toHaveBeenCalled(); expect(router.navigate).not.toHaveBeenCalled();
});
it("prefers the Sheet stack continuation when nested readers need to leave several overlays", () => {
  const requestCloseThen = vi.fn(), requestCloseStackThen = vi.fn();
  const view = renderQuery({ query: { error: new RemoteHostError("machine", "identity", "Identity changed") } },
    { register: vi.fn(), requestClose: vi.fn(), requestCloseThen, requestCloseStackThen });
  view!.props.action.onPress(); expect(requestCloseStackThen).toHaveBeenCalledOnce(); expect(requestCloseThen).not.toHaveBeenCalled(); expect(router.navigate).not.toHaveBeenCalled();
  requestCloseStackThen.mock.calls[0][0](); expect(router.navigate).toHaveBeenCalledExactlyOnceWith("/machines");
});
it("keeps a network retry within its reader instead of starting Sheet dismissal", () => {
  const requestCloseThen = vi.fn(), refetch = vi.fn();
  const view = renderQuery({ query: { error: new RemoteHostError("machine", "network", "Offline"), refetch } },
    { register: vi.fn(), requestClose: vi.fn(), requestCloseThen });
  expect(view!.props.action.label).toBe("Retry"); expect(view!.props.illustration).toBe("unreachable");
  view!.props.action.onPress(); expect(refetch).toHaveBeenCalledOnce(); expect(requestCloseThen).not.toHaveBeenCalled();
});
it("keeps network retry independent from a caller's connection-navigation action", () => {
  const refetch = vi.fn(), recover = vi.fn();
  const view = renderQuery({ query: { error: new RemoteHostError("machine", "network", "Offline"), refetch }, onManageConnections: recover });
  expect(view!.props.action.label).toBe("Retry"); view!.props.action.onPress();
  expect(refetch).toHaveBeenCalledOnce(); expect(recover).not.toHaveBeenCalled();
});

it("keeps cached data untouched and renders no banner when a refresh fails", () => {
  const data = [{ id: "last-known" }], refetch = vi.fn();
  const kinds = ["unsupported", "network"] as const;
  for (const kind of kinds) {
    const query = { data, error: new RemoteHostError("machine", kind, "Failed"), refetch };
    expect(renderQuery({ query })).toBeNull();
    expect(renderQuery({ query: { ...query, isFetching: true } })).toBeNull();
  }
  expect(refetch).not.toHaveBeenCalled();
});
it("still sends cached auth and identity failures to repair through the Sheet stack", () => {
  const requestCloseStackThen = vi.fn(), refetch = vi.fn();
  for (const kind of ["auth", "identity"] as const) {
    const view = renderQuery({ query: { data: [1], error: new RemoteHostError("machine", kind, "Repair"), refetch } },
      { register: vi.fn(), requestClose: vi.fn(), requestCloseThen: vi.fn(), requestCloseStackThen });
    expect(view!.type).toBe("StateView"); expect(view!.props.action.label).toBe("Manage connections");
    view!.props.action.onPress();
  }
  expect(requestCloseStackThen).toHaveBeenCalledTimes(2);
  expect(router.navigate).not.toHaveBeenCalled(); expect(refetch).not.toHaveBeenCalled();
});
it("renders nothing over cached data while the query waits for a connection", () => {
  expect(renderQuery({ query: { data: [1], fetchStatus: "paused" } })).toBeNull();
});
it("centers a waiting state with a connections action when paused without data", () => {
  const manage = vi.fn();
  const view = renderQuery({ query: { fetchStatus: "paused", status: "pending" }, onManageConnections: manage })!;
  expect(view.type).toBe("StateView");
  expect(view.props.title).toBe("Waiting for a connection");
  expect(view.props.illustration).toBe("unreachable");
  expect(view.props.action.label).toBe("Manage connections");
  view.props.action.onPress(); expect(manage).toHaveBeenCalledOnce();
});

it("shows a calm reconnecting state instead of Retry while a dropped link recovers on its own", () => {
  quiet.on = true;
  const error = new RemoteHostError("machine", "network", "Offline");
  const refetch = vi.fn();
  // Reconnecting keeps the content-shaped placeholder; the computer pill shows the link state.
  const waiting = renderQuery({ query: { error, refetch } })!;
  expect(waiting.type).toBe("Skeleton");
  expect(waiting.props.label).toBeUndefined();
  const cached = renderQuery({ query: { error, refetch, data: [1] } });
  expect(cached).toBeNull();
  const auth = renderQuery({ query: { error: new RemoteHostError("machine", "auth", "x"), refetch } })!;
  expect(auth.type).toBe("StateView");
});

it("marks shown data as not current when a refresh fails for a reason other than the link", () => {
  const refetch = vi.fn();
  // A rejected reply while connected: without a sign the list kept showing an old "Running".
  const rejected = renderQuery({ query: { data: [1], error: new RemoteHostError("computer", "protocol", "Invalid reply"), refetch } });
  expect(rejected?.type).toBe("Notice");
  expect(rejected?.props.message).toBe("Showing the last loaded version; it could not be refreshed.");
  rejected?.props.action.onPress();
  expect(refetch).toHaveBeenCalledOnce();
  // Link problems stay with the computer pill.
  expect(renderQuery({ query: { data: [1], error: new RemoteHostError("computer", "network", "down"), refetch } })).toBeNull();
});

it("offers to refresh cached data when a connected Host reports that the read failed", () => {
  quiet.on = true;
  const refetch = vi.fn();
  const error = Object.assign(
    new RemoteHostError("computer", "host", "Host read could not be completed."),
    { transient: true },
  );
  const props = { query: { data: [1], error, refetch } };
  const feedback = renderQuery(props);
  expect(feedback?.props.message).toBe("Showing the last loaded version; it could not be refreshed.");
  feedback?.props.action.onPress();
  expect(refetch).toHaveBeenCalledOnce();

  onlineManager.setOnline(false);
  expect(renderQuery(props)).toBeNull();
});

it("offers Retry after an initial Host read fails while the link is up", () => {
  quiet.on = true;
  const refetch = vi.fn();
  const error = Object.assign(
    new RemoteHostError("computer", "host", "Host read could not be completed."),
    { transient: true },
  );
  const feedback = renderQuery({ query: { error, refetch }, loading: "inline" });
  expect(feedback?.type).toBe("StateView");
  expect(feedback?.props.action.label).toBe("Retry");
  feedback?.props.action.onPress();
  expect(refetch).toHaveBeenCalledOnce();
});
