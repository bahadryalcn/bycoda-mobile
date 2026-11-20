import { describe, expect, it, vi } from "vitest";
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("@/ui/primitives", () => ({ StateView: "StateView", QueryState: "QueryState" }));
vi.mock("react-native", () => ({ View: "View" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
const machine = vi.hoisted(() => ({ phase: "disconnected" }));
vi.mock("@/ui/machine-bar", () => ({ useMachineStatus: () => machine }));
import { router } from "expo-router";
import { getQueryPresentation } from "@/ui/query-presentation";
import { ProjectDirectoryFeedback,ProjectDirectorySlot } from "./project-directory-feedback";
// The slot always renders a stable container; its child is the state (or nothing).
const slot = (props: Parameters<typeof ProjectDirectorySlot>[0]) => ProjectDirectorySlot(props).props.children;

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
    expect(view.type).toBe("StateView");
    expect(view.props.title).toContain("Waiting for a connection");
    view.props.action.onPress();
    expect(router.push).toHaveBeenCalledWith("/machines");
  });

  it("loads instead of claiming a lost connection while the link is checked or up", () => {
    for (const phase of ["checking", "connected"]) {
      machine.phase = phase;
      const query = { fetchStatus: "paused" as const, isPending: true };
      const view = ProjectDirectoryFeedback({ query, readiness: "waiting", loading: "content" });
      expect(view.type).toBe("QueryState");
      // The idle/paused read of a freshly selected computer must present as loading, never blank.
      expect(getQueryPresentation(view.props.query)).toBe("loading");
      expect(getQueryPresentation(ProjectDirectoryFeedback({ query: { isPending: true, fetchStatus: "idle", isEnabled: false }, readiness: "waiting" }).props.query)).toBe("loading");
    }
    machine.phase = "disconnected";
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
    expect(view.type).toBe("StateView");
    view.props.action.onPress();
    expect(refetch).toHaveBeenCalledOnce();
    const busy = ProjectDirectoryFeedback({ query: { refetch, isFetching: true }, privacyUnavailable: true });
    busy.props.action.onPress();
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("retains caller loading/empty semantics for an ordinary authorized query", () => {
    const view = ProjectDirectoryFeedback({ query: { status: "success", data: [] }, empty: true, emptyTitle: "No projects", loading: "content" });
    expect(view.type).toBe("QueryState");
    expect(view.props).toMatchObject({ empty: true, emptyTitle: "No projects", loading: "content" });
  });

  it("renders nothing above data, a centered state for the empty region, and never hides an error behind empty data", () => {
    expect(slot({ query: { status: "success", data: [{}] } })).toBeNull();
    expect(slot({ query: { fetchStatus: "paused", data: [{}] } })).toBeNull();
    expect(ProjectDirectoryFeedback(slot({ query: {}, readiness: "waiting" })!.props).type).toBe("StateView");
    expect(ProjectDirectoryFeedback(slot({ query: {}, privacyUnavailable: true })!.props).type).toBe("StateView");
    const failed = ProjectDirectoryFeedback(slot({ query: { data: [], error: new Error("Read failed") } })!.props);
    expect(failed.type).toBe("QueryState");
    expect(failed.props.query.data).toBeUndefined();
  });
});
