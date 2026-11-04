import { describe, expect, it, vi } from "vitest";
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("@/ui/primitives", () => ({ Notice: "Notice", QueryState: "QueryState" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
import { router } from "expo-router";
import { ProjectDirectoryFeedback } from "./project-directory-feedback";

describe("directory feedback ownership", () => {
  it("honors embedded connection recovery for waiting and forwards it for exact query failures", () => {
    const onManageConnections = vi.fn();
    const waiting = ProjectDirectoryFeedback({ query: {}, readiness: "waiting", onManageConnections });
    waiting.props.action.onPress(); expect(onManageConnections).toHaveBeenCalledOnce();
    const failure = ProjectDirectoryFeedback({ query: { error: new Error("Disconnected") }, onManageConnections });
    expect(failure.props.onManageConnections).toBe(onManageConnections);
  });
  it("shows one reconnect explanation instead of paused/loading feedback as well", () => {
    const view = ProjectDirectoryFeedback({ query: { fetchStatus: "paused", isPending: true }, readiness: "waiting" });
    expect(view.type).toBe("Notice");
    expect(view.props.message).toContain("Waiting for a connection");
    view.props.action.onPress();
    expect(router.push).toHaveBeenCalledWith("/machines");
  });

  it("preserves precise auth recovery instead of replacing an error with generic waiting", () => {
    const query = { error: { kind: "auth" }, status: "error" as const };
    const view = ProjectDirectoryFeedback({ query, readiness: "waiting", privacyUnavailable: true });
    expect(view.type).toBe("QueryState");
    expect(view.props.query).toBe(query);
  });

  it("keeps synchronization recovery local and prevents duplicate refetches", () => {
    const refetch = vi.fn();
    const view = ProjectDirectoryFeedback({ query: { refetch }, privacyUnavailable: true });
    expect(view.type).toBe("Notice");
    view.props.onRetry();
    expect(refetch).toHaveBeenCalledOnce();
    const busy = ProjectDirectoryFeedback({ query: { refetch, isFetching: true }, privacyUnavailable: true });
    busy.props.onRetry();
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("retains caller loading/empty semantics for an ordinary authorized query", () => {
    const view = ProjectDirectoryFeedback({ query: { status: "success", data: [] }, empty: true, emptyTitle: "No projects", loading: "content" });
    expect(view.type).toBe("QueryState");
    expect(view.props).toMatchObject({ empty: true, emptyTitle: "No projects", loading: "content" });
  });
});
