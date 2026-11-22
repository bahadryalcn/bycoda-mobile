import { describe, expect, it, vi } from "vitest";
vi.mock("@/ui/primitives", () => ({ Body: "Body", Notice: "Notice", StateView: "StateView", QueryState: "QueryState" }));
vi.mock("react-native", () => ({ View: "View" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/connection-feedback-scope", () => ({ useConnectionFeedbackOwner: () => ({ visible: true }) }));
const machine = vi.hoisted(() => ({
  phase: "disconnected",
  status: "Connection couldn’t start",
  reason: "Close and reopen Bycoda.",
}));
vi.mock("@/ui/machine-bar", () => ({ useMachineStatus: () => machine }));
import { getQueryPresentation } from "@/ui/query-presentation";
import { ProjectDirectoryFeedback,ProjectDirectorySlot } from "./project-directory-feedback";
// The slot always renders a stable container; its child is the state (or nothing).
const slot = (props: Parameters<typeof ProjectDirectorySlot>[0]) => ProjectDirectorySlot(props).props.children;

describe("directory feedback ownership", () => {
  it("uses the device-offline presentation for an empty directory", () => {
    machine.phase = "offline";
    try {
      const view = ProjectDirectoryFeedback({ query: { isEnabled: false }, readiness: "waiting" });
      expect(view.type).toBe("QueryState");
      expect(view.props.query.fetchStatus).toBe("paused");
    } finally {
      machine.phase = "disconnected";
    }
  });
  it("gives app restart guidance when the connection itself could not start", () => {
    machine.phase = "startup-failed";
    try {
      const view = ProjectDirectoryFeedback({ query: {}, readiness: "waiting" });
      expect(view.props.title).toBe("Connection couldn’t start");
      expect(view.props.description).toBe("Close and reopen Bycoda.");
      expect(view.props.action).toBeUndefined();
    } finally {
      machine.phase = "disconnected";
    }
  });
  it("honors embedded connection recovery for waiting and forwards it for exact query failures", () => {
    const onManageConnections = vi.fn();
    const waiting = ProjectDirectoryFeedback({ query: {}, readiness: "waiting", onManageConnections });
    expect(waiting.props.onManageConnections).toBe(onManageConnections);
    const failure = ProjectDirectoryFeedback({ query: { error: new Error("Disconnected") }, onManageConnections });
    expect(failure.props.onManageConnections).toBe(onManageConnections);
  });
  it("shows one reconnect explanation instead of paused/loading feedback as well", () => {
    const view = ProjectDirectoryFeedback({ query: { fetchStatus: "paused", isPending: true }, readiness: "waiting" });
    expect(view.type).toBe("QueryState");
    expect(view.props.query.fetchStatus).toBe("paused");
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

  it("gives a compact filter the same actionable sync recovery", () => {
    const refetch = vi.fn();
    const view = ProjectDirectoryFeedback({ compact: true, query: { refetch }, privacyUnavailable: true });
    expect(view.type).toBe("Notice");
    expect(view.props.message).toBe("The project list needs a sync");
    expect(view.props.children.props.children).toContain("Open bycoda on this computer");
    expect(view.props.retryLabel).toBe("Refresh");
    view.props.onRetry();
    expect(refetch).toHaveBeenCalledOnce();
    const fetching = ProjectDirectoryFeedback({ compact: true, query: { refetch, isFetching: true }, privacyUnavailable: true });
    expect(fetching.props.retrying).toBe(true);
    fetching.props.onRetry();
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
    expect(ProjectDirectoryFeedback(slot({ query: {}, readiness: "waiting" })!.props).type).toBe("QueryState");
    expect(ProjectDirectoryFeedback(slot({ query: {}, privacyUnavailable: true })!.props).type).toBe("StateView");
    const failed = ProjectDirectoryFeedback(slot({ query: { data: [], error: new Error("Read failed") } })!.props);
    expect(failed.type).toBe("QueryState");
    expect(failed.props.query.data).toBeUndefined();
  });
});
