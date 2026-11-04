import { createElement, type ComponentProps, type ContextType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { SheetGuardContext } from "./sheet-guard-context";
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./feedback", () => ({ Empty: "Empty", ErrorNotice: "ErrorNotice", Loading: "Loading", Notice: "Notice", Skeleton: "Skeleton" }));
vi.mock("./typography", () => ({ Body: "Body" }));
import { QueryState } from "./query-state";
function renderQuery(props: ComponentProps<typeof QueryState>, scope?: ContextType<typeof SheetGuardContext>) {
  let result: ReturnType<typeof QueryState> = null;
  function Probe() { result = QueryState(props); return null; }
  renderToStaticMarkup(scope ? createElement(SheetGuardContext.Provider, { value: scope }, createElement(Probe)) : createElement(Probe));
  return result as ReturnType<typeof QueryState>;
}

import { router } from "expo-router";
import { RemoteHostError } from "../remote/host-error";
beforeEach(() => vi.clearAllMocks());

it("uses caller-owned connection recovery for authentication and identity while keeping the default route", () => {
  const recover = vi.fn();
  for (const kind of ["auth", "identity"] as const) {
    const query = { error: new RemoteHostError("machine", kind, "Repair pairing"), status: "error" as const };
    const embedded = renderQuery({ query, onManageConnections: recover });
    expect(embedded!.props.action.onPress).toBe(recover); embedded!.props.action.onPress();
    expect(embedded!.props.onRetry).toBeUndefined();
    renderQuery({ query })!.props.action.onPress();
  }
  expect(recover).toHaveBeenCalledTimes(2); expect(router.push).toHaveBeenCalledWith("/machines");
});
it("defers default repair to the nearest Sheet approval and does not navigate before it completes", () => {
  const requestCloseThen = vi.fn(), requestClose = vi.fn();
  const scope = { register: vi.fn(), requestClose, requestCloseThen };
  for (const kind of ["auth", "identity"] as const) {
    const view = renderQuery({ query: { error: new RemoteHostError("machine", kind, "Pairing") } }, scope);
    view!.props.action.onPress();
    expect(router.push).not.toHaveBeenCalled();
  }
  expect(requestCloseThen).toHaveBeenCalledTimes(2); expect(requestClose).not.toHaveBeenCalled();
  requestCloseThen.mock.calls[1][0](); expect(router.push).toHaveBeenCalledExactlyOnceWith("/machines");
});
it("preserves an explicit recovery owner inside a Sheet", () => {
  const requestCloseThen = vi.fn(), recover = vi.fn();
  const view = renderQuery({ query: { error: new RemoteHostError("machine", "auth", "Pairing") }, onManageConnections: recover },
    { register: vi.fn(), requestClose: vi.fn(), requestCloseThen });
  view!.props.action.onPress(); expect(recover).toHaveBeenCalledOnce(); expect(requestCloseThen).not.toHaveBeenCalled(); expect(router.push).not.toHaveBeenCalled();
});
it("prefers the Sheet stack continuation when nested readers need to leave several overlays", () => {
  const requestCloseThen = vi.fn(), requestCloseStackThen = vi.fn();
  const view = renderQuery({ query: { error: new RemoteHostError("machine", "identity", "Identity changed") } },
    { register: vi.fn(), requestClose: vi.fn(), requestCloseThen, requestCloseStackThen });
  view!.props.action.onPress(); expect(requestCloseStackThen).toHaveBeenCalledOnce(); expect(requestCloseThen).not.toHaveBeenCalled(); expect(router.push).not.toHaveBeenCalled();
  requestCloseStackThen.mock.calls[0][0](); expect(router.push).toHaveBeenCalledExactlyOnceWith("/machines");
});
it("keeps a network retry within its reader instead of starting Sheet dismissal", () => {
  const requestCloseThen = vi.fn(), refetch = vi.fn();
  const view = renderQuery({ query: { error: new RemoteHostError("machine", "network", "Offline"), refetch } },
    { register: vi.fn(), requestClose: vi.fn(), requestCloseThen });
  expect(view!.props.action).toBeUndefined(); view!.props.onRetry(); expect(refetch).toHaveBeenCalledOnce(); expect(requestCloseThen).not.toHaveBeenCalled();
});
it("keeps network retry independent from a caller's connection-navigation action", () => {
  const refetch = vi.fn(), recover = vi.fn();
  const view = renderQuery({ query: { error: new RemoteHostError("machine", "network", "Offline"), refetch }, onManageConnections: recover });
  expect(view!.props.action).toBeUndefined(); view!.props.onRetry();
  expect(refetch).toHaveBeenCalledOnce(); expect(recover).not.toHaveBeenCalled();
});

it("keeps cached unsupported data visible with update guidance and no ineffective retry", () => {
  const data = [{ id: "last-known" }], refetch = vi.fn();
  const query = { data, error: new RemoteHostError("machine", "unsupported", "Unsupported method"), refetch };
  const view = renderQuery({ query });
  expect(view!.props.message).toBe("Update Bycoda on your computer to use this feature. Could not refresh. Showing the last received information.");
  expect(view!.props.onRetry).toBeUndefined();
  expect(query.data).toBe(data); expect(refetch).not.toHaveBeenCalled();
});
it("keeps cached authentication and identity recovery guarded by the Sheet stack", () => {
  const requestCloseStackThen = vi.fn(), refetch = vi.fn();
  for (const kind of ["auth", "identity"] as const) {
    const view = renderQuery({ query: { data: [1], error: new RemoteHostError("machine", kind, "Repair"), refetch } },
      { register: vi.fn(), requestClose: vi.fn(), requestCloseThen: vi.fn(), requestCloseStackThen });
    expect(view!.props.onRetry).toBeUndefined(); view!.props.action.onPress();
  }
  expect(requestCloseStackThen).toHaveBeenCalledTimes(2);
  expect(router.push).not.toHaveBeenCalled(); expect(refetch).not.toHaveBeenCalled();
});
it("keeps cached network refresh retry available but refuses a duplicate during fetching", () => {
  const refetch = vi.fn();
  const query = { data: [1], error: new RemoteHostError("machine", "network", "Offline"), refetch };
  renderQuery({ query })!.props.onRetry();
  renderQuery({ query: { ...query, isFetching: true } })!.props.onRetry();
  expect(refetch).toHaveBeenCalledOnce();
});
