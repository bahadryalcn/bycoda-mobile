// @vitest-environment happy-dom
import { act, createElement, type ComponentProps, type ContextType } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { SheetGuardContext } from "./sheet-guard-context";
import { ConnectionFeedbackScope } from "./connection-feedback-scope";
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./feedback", () => ({ Empty: "Empty", ErrorNotice: "ErrorNotice", Loading: "Loading", Notice: "Notice", Skeleton: "Skeleton", StatusLine: "StatusLine" }));
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

it("uses custom progress only while the query can load", () => {
  const query = { status: "pending", fetchStatus: "fetching", failureCount: 1 } as const;
  const renderLoading = vi.fn((label: string) => createElement("div", { "aria-label": label }));
  const props = { query, loading: "centered", renderLoading } as const;

  expect(renderQuery(props)?.props["aria-label"]).toBe("Loading…");
  onlineManager.setOnline(false);
  expect(renderQuery(props)?.props.title).toBe("You're offline");
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

it("shows offline immediately during an initial fetch and retains an explicit repair error", () => {
  recordActiveHostMachine("machine");
  recordHostRuntimeState("machine", "backoff");
  onlineManager.setOnline(false);
  expect(renderQuery({ query: { status: "pending", fetchStatus: "fetching" } })?.props.title).toBe("You're offline");
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
  expect(waiting?.props.size).toBe("compact");
  expect(waiting?.props.title).toBe("Waiting for a connection");
  expect(waiting?.props.action.label).toBe("Manage connections");
});

it("shows one centered offline state instead of reconnecting while the device has no network", () => {
  onlineManager.setOnline(false);
  const failed = renderQuery({ query: { error: new RemoteHostError("computer", "network", "down"), refetch: vi.fn() } });
  expect(failed?.props.illustration).toBeUndefined();
  expect(failed?.props.size).toBe("region");
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
    expect(embedded!.props.action.label).toBe("Manage connections"); expect(embedded!.props.tone).toBe("warning");
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
  expect(view!.props.action.label).toBe("Retry"); expect(view!.props.title).toBe("Can't reach your computer");
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
  expect(view.props.illustration).toBeUndefined();
  expect(view.props.size).toBe("region");
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


/** Mounts QueryState sections (optionally in one Screen scope) under fake timers. */
async function mountSections(sections: Array<ComponentProps<typeof QueryState>>, scoped = false) {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  const view = { rendered: [] as Rendered[] };
  function Probe({ index, props }: { index: number; props: ComponentProps<typeof QueryState> }) {
    view.rendered[index] = unwrap(QueryState(props));
    return null;
  }
  const render = (next: Array<ComponentProps<typeof QueryState>>) => act(async () => {
    const probes = next.map((props, index) => createElement(Probe, { key: index, index, props }));
    root.render(scoped ? createElement(ConnectionFeedbackScope, null, ...probes) : createElement("div", null, ...probes));
  });
  await render(sections);
  return {
    view,
    render,
    advance: (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); }),
    async unmount() {
      await act(async () => root.unmount());
      vi.useRealTimers();
      vi.unstubAllGlobals();
    },
  };
}

it("keeps a timed-out read on a reachable computer quiet for the grace with one automatic retry", async () => {
  quiet.on = true;
  recordActiveHostMachine("pc");
  recordHostRuntimeState("pc", "ready");
  const refetch = vi.fn();
  const query = { error: new RemoteHostError("pc", "timeout", "Timed out"), refetch };
  const mounted = await mountSections([{ query, loading: "inline" }]);
  try {
    expect(mounted.view.rendered[0]?.type).toBe("Loading");
    await mounted.advance(1_000);
    expect(refetch).toHaveBeenCalledOnce();
    await mounted.advance(4_999);
    expect(mounted.view.rendered[0]?.type).toBe("Loading");
    await mounted.advance(1);
    const state = mounted.view.rendered[0];
    expect(state?.props.title).toBe("The computer took too long to respond");
    expect(state?.props.tone).toBe("warning");
    expect(state?.props.description).toBeUndefined();
    expect(state?.props.illustration).toBeUndefined();
    // Inline loading marks a section: the failure is compact there, not a full region.
    expect(state?.props.size).toBe("compact");
    expect(state?.props.action?.label).toBe("Retry");
    state?.props.action?.onPress();
    expect(refetch).toHaveBeenCalledTimes(2);
  } finally {
    await mounted.unmount();
  }
});

it("keeps two timed-out reads on a reachable Host independently retryable", async () => {
  quiet.on = true;
  recordActiveHostMachine("pc");
  recordHostRuntimeState("pc", "ready");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
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
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
    for (const state of feedback) expect(state?.props.action?.label).toBe("Retry");
    refetches.forEach((refetch) => refetch.mockClear());
    feedback[1]?.props.action?.onPress();
    expect(refetches[0]).not.toHaveBeenCalled();
    expect(refetches[1]).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it("offers Retry after an initial Host read fails while the link is up, after the quiet grace", async () => {
  quiet.on = true;
  const refetch = vi.fn();
  const error = Object.assign(
    new RemoteHostError("computer", "host", "Host read could not be completed."),
    { transient: true },
  );
  const mounted = await mountSections([{ query: { error, refetch }, loading: "inline" }]);
  try {
    expect(mounted.view.rendered[0]?.type).toBe("Loading");
    await mounted.advance(6_000);
    const feedback = mounted.view.rendered[0];
    expect(feedback?.type).toBe("StateView");
    expect(feedback?.props.action.label).toBe("Retry");
    expect(refetch).toHaveBeenCalledOnce();
    feedback?.props.action.onPress();
    expect(refetch).toHaveBeenCalledTimes(2);
  } finally {
    await mounted.unmount();
  }
});

it("says the automatic retry is slow when it outlasts the grace", async () => {
  recordActiveHostMachine("pc");
  recordHostRuntimeState("pc", "ready");
  const refetch = vi.fn(() => new Promise(() => undefined));
  const query = { error: new RemoteHostError("pc", "protocol", "Invalid reply"), refetch };
  const mounted = await mountSections([{ query }]);
  try {
    await mounted.advance(6_000);
    expect(mounted.view.rendered[0]?.type).toBe("Skeleton");
    expect(mounted.view.rendered[0]?.props.label).toBe("The computer is slow to answer; trying again…");
  } finally {
    await mounted.unmount();
  }
});

it("reports a failed load once per screen: the first section owns it, later sections show one line", async () => {
  const retries = [vi.fn(), vi.fn()];
  const failed = (index: number) => ({ query: { error: new Error(`Broken ${index}`), refetch: retries[index] } });
  const mounted = await mountSections([failed(0), failed(1)], true);
  try {
    const [owner, later] = mounted.view.rendered;
    expect(owner?.props.size).toBe("region");
    expect(owner?.props.action.label).toBe("Retry");
    expect(later?.props.size).toBe("line");
    expect(later?.props.action).toBeUndefined();
    // The owner's Retry retries every failed read of the screen.
    await act(async () => { owner?.props.action.onPress(); });
    expect(retries[0]).toHaveBeenCalledOnce();
    expect(retries[1]).toHaveBeenCalledOnce();
  } finally {
    await mounted.unmount();
  }
});

it("keeps cached data silent after one failed refresh and shows one status line once it repeats for 15 s", async () => {
  quiet.on = true;
  recordActiveHostMachine("pc");
  recordHostRuntimeState("pc", "ready");
  const refetch = vi.fn();
  const failed = () => ({ query: { data: [1], error: new RemoteHostError("pc", "timeout", "Timed out"), refetch }, loading: "inline" as const });
  const mounted = await mountSections([failed()]);
  try {
    expect(mounted.view.rendered[0]).toBeNull();
    // Two failures in quick succession (a poll that then heals) stay silent.
    await mounted.render([failed()]);
    expect(mounted.view.rendered[0]).toBeNull();
    await mounted.advance(15_000);
    const line = mounted.view.rendered[0];
    expect(line?.type).toBe("StatusLine");
    expect(line?.props.tone).toBe("warning");
    expect(line?.props.label).toBe("Showing the last loaded version; it could not be refreshed.");
    expect(line?.props.action?.label).toBe("Refresh");
    await act(async () => { line?.props.action?.onPress(); });
    expect(refetch).toHaveBeenCalledOnce();
    await mounted.render([{ ...failed(), query: { ...failed().query, fetchStatus: "fetching" } }]);
    expect(mounted.view.rendered[0]).toBeNull();
  } finally {
    await mounted.unmount();
  }
});

it("marks shown data as not current after a minute of failed refreshes, never for a link problem", async () => {
  const refetch = vi.fn();
  const error = new RemoteHostError("computer", "protocol", "Invalid reply");
  const mounted = await mountSections([{ query: { data: [1], error, refetch } }]);
  try {
    expect(mounted.view.rendered[0]).toBeNull();
    await mounted.advance(60_000);
    expect(mounted.view.rendered[0]?.type).toBe("StatusLine");
    // Link problems stay with the computer pill.
    await mounted.render([{ query: { data: [1], error: new RemoteHostError("computer", "network", "down"), refetch } }]);
    await mounted.advance(60_000);
    expect(mounted.view.rendered[0]).toBeNull();
    onlineManager.setOnline(false);
    await mounted.render([{ query: { data: [1], error, refetch } }]);
    await mounted.advance(60_000);
    expect(mounted.view.rendered[0]).toBeNull();
  } finally {
    await mounted.unmount();
  }
});

it("restarts the read retry grace when the app returns from the background", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const { useReadRetryNotice } = await import("./query-state");
  const { holdHostRecoveryClocks, resumeHostRecoveryClocks } = await import("../state/host-runtime-state");
  const root = createRoot(document.createElement("div"));
  const seen = { explained: false };
  function Probe() { seen.explained = useReadRetryNotice(true, "computer"); return null; }
  try {
    await act(async () => root.render(createElement(Probe)));
    // The grace timer ran out while the app was away (timers fire at once on return).
    holdHostRecoveryClocks();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(seen.explained).toBe(true);
    await act(async () => resumeHostRecoveryClocks());
    expect(seen.explained).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(seen.explained).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    expect(seen.explained).toBe(true);
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it("gives a region empty state the shared mascot, keeps caller art and leaves section rows icon-only", () => {
  const done = { status: "success", isSuccess: true, data: [] } as const;
  expect(renderQuery({ query: done, empty: true, size: "region" })?.props.illustration).toBe("inbox-empty");
  expect(renderQuery({ query: done, empty: true })?.props.illustration).toBe("inbox-empty");
  expect(renderQuery({ query: done, empty: true, emptyIllustration: "no-sessions" })?.props.illustration).toBe("no-sessions");
  expect(renderQuery({ query: done, empty: true, loading: "inline" })?.props.illustration).toBeUndefined();
  expect(renderQuery({ query: done, empty: true, compact: true })?.props.illustration).toBeUndefined();
});

it("never shows an empty state before the read succeeds, and delays an inline read spinner", () => {
  const pending = { status: "pending", fetchStatus: "fetching", isLoading: true } as const;
  expect(renderQuery({ query: pending, empty: true })?.type).toBe("Skeleton");
  const inline = renderQuery({ query: pending, empty: true, loading: "inline" });
  expect(inline?.type).toBe("Loading");
  expect(inline?.props.delayed).toBe(true);
});
