import { createElement, type ComponentProps, type ContextType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { SheetGuardContext } from "./sheet-guard-context";
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

it("uses custom progress only while the query can load", () => {
  const query = { status: "pending", fetchStatus: "fetching", failureCount: 1 } as const;
  const renderLoading = vi.fn((label: string) => createElement("div", { "aria-label": label }));
  const props = { query, loading: "centered", renderLoading } as const;

  expect(renderQuery(props)?.props["aria-label"]).toBe("The computer is slow to answer; trying again…");
  onlineManager.setOnline(false);
  expect(renderQuery(props)?.props.illustration).toBe("offline");
  expect(renderLoading).toHaveBeenCalledOnce();
});

it("says a retried slow load is still trying instead of showing a silent placeholder", () => {
  const probe: { lead: Rendered } = { lead: null };
  function Probe() {
    const tree = QueryState({ query: { status: "pending", fetchStatus: "fetching", isLoading: true, failureCount: 1 } });
    probe.lead = ((tree?.props as { children: Rendered[] }).children)[0] ?? null;
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  expect(probe.lead?.props.message).toBe("The computer is slow to answer; trying again…");
  expect(renderQuery({ query: { status: "pending", fetchStatus: "fetching", isLoading: true, failureCount: 1 } })?.props.label)
    .toBe("The computer is slow to answer; trying again…");
});

it("says the computer is unreachable instead of loading while its socket waits to reconnect", () => {
  expect(renderQuery({ query: { status: "pending", fetchStatus: "fetching", isLoading: true } })?.type).toBe("Skeleton");
  recordHostRuntimeState("machine", "backoff");
  // Another computer's dropped link says nothing about the selected one.
  recordActiveHostMachine("other");
  expect(renderQuery({ query: { status: "pending", fetchStatus: "fetching", isLoading: true } })?.type).toBe("Skeleton");
  recordActiveHostMachine("machine");
  const waiting = renderQuery({ query: { status: "pending", fetchStatus: "fetching", isLoading: true } });
  expect(waiting?.props.title).toBe("Waiting for a connection");
  expect(waiting?.props.action.label).toBe("Manage connections");
  // Without a live socket, the pill's Disconnected verdict is the same signal.
  resetHostRuntimeStates();
  recordActiveHostDisconnected(true);
  expect(renderQuery({ query: { status: "pending", fetchStatus: "fetching", isLoading: true } })?.props.title).toBe("Waiting for a connection");
  // Loaded data stays on screen; the pill reports the link.
  expect(renderQuery({ query: { data: [1], status: "success" } })).toBeNull();
});

it("shows offline immediately during an initial fetch and retains an explicit repair error", () => {
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
  expect(waiting.props.label).toBe("Reconnecting…");
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
