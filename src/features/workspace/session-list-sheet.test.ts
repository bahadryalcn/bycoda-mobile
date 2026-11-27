// @vitest-environment happy-dom
import { act, createElement as h, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { QueryLike } from "@/ui/query-presentation";
import { SessionListSheet } from "./session-list-sheet";

vi.mock("@/ui/swipe-actions", () => ({
  SwipeActionsGroup: ({ children }: { children: ReactNode }) => children,
}));

const fixture = vi.hoisted(() => ({
  activeId: "computer", epoch: 1, directory: [] as unknown[], error: undefined as unknown,
  readiness: "ready", replace: vi.fn(), rowPress: undefined as (() => void) | undefined,
}));
vi.mock("expo-router", () => ({ router: { replace: fixture.replace } }));
vi.mock("react-native", () => ({
  FlatList: ({ data, ListHeaderComponent, ListEmptyComponent, renderItem }: {
    data: { key: string }[];
    ListHeaderComponent?: ReactNode;
    ListEmptyComponent?: ReactNode;
    renderItem: (entry: { item: { key: string } }) => ReactNode;
  }) => h("section", null, ListHeaderComponent, data.length ? data.map((item) =>
    h("div", { key: item.key }, renderItem({ item }))) : ListEmptyComponent),
}));
vi.mock("@/state/connection-scope", () => ({
  useConnectionScope: () => {
    const { activeId, epoch } = fixture;
    return { review: { id: activeId }, token: String(epoch), isCurrent: () => fixture.activeId === activeId && fixture.epoch === epoch };
  },
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => ({
  QueryState: ({ query }: { query: QueryLike }) => h("p", null, query.error ? (query.data ? "Refresh failed" : "Load failed") : null),
  StateView: ({ title }: { title: string }) => h("p", null, title),
  Sheet: ({ children }: { children: ReactNode }) => h("section", null, children),
}));
vi.mock("./project-directory-feedback", () => ({
  ProjectDirectoryFeedback: ({ readiness, query }: { readiness: string; query: QueryLike }) =>
    h("p", null, query.error ? "Load failed" : readiness === "waiting" ? "Waiting for a connection" : "Loading sessions"),
  directoryOwnsRegion: ({ readiness, query }: { readiness: string; query: QueryLike }) => readiness === "waiting" || !!query.error,
}));
vi.mock("./session-list-row", () => ({
  SessionListRow: ({ session, projectId, onPress }: {
    session: { id: string; title: string }; projectId: string; onPress: (id: string, projectId: string) => void;
  }) => {
    fixture.rowPress = () => onPress(session.id, projectId);
    return h("p", null, session.title);
  },
}));
vi.mock("./use-project-activity", () => ({
  useProjectActivity: () => ({
    projects: { data: [project], isProjectVisible: () => true },
    directory: fixture.directory,
    error: fixture.error,
    readiness: fixture.readiness,
  }),
}));

const project = { id: "project", name: "Project", cwd: "/project" };
const session = (title: string, updatedAt: number, archived = false) => ({
  project, session: { id: title, title, status: "idle", updatedAt, archived },
});
const render = () => renderToStaticMarkup(h(SessionListSheet, {
  visible: true, onClose: () => {}, machineId: "computer", selectedSessionId: "selected",
}));

beforeEach(() => {
  fixture.activeId = "computer";
  fixture.epoch = 1;
  fixture.directory = [];
  fixture.error = undefined;
  fixture.readiness = "ready";
  fixture.replace.mockClear();
  fixture.rowPress = undefined;
});

it("keeps recent rows visible and exposes refresh failure at the top", () => {
  fixture.directory = [session("Recent session", Date.now())];
  fixture.error = new Error("summary rejected");
  const view = render();
  expect(view).toContain("Recent session");
  expect(view).toContain("Refresh failed");
});

it("reports failed reads when only filtered-out records are cached", () => {
  fixture.directory = [session("Archived session", Date.now(), true)];
  fixture.error = new Error("summary rejected");
  const view = render();
  expect(view).toContain("Load failed");
  expect(view).not.toContain("No sessions yet.");
});

it("keeps a pending connection and a changed computer distinct from a true empty list", () => {
  fixture.readiness = "waiting";
  expect(render()).toContain("Waiting for a connection");
  fixture.activeId = "another-computer";
  expect(render()).toContain("Computer connection changed.");
  fixture.activeId = "computer";
  fixture.readiness = "ready";
  expect(render()).toContain("No sessions yet.");
});

it("keeps the portrait switcher on its reviewed connection until it closes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const onClose = vi.fn();
  const sheet = () => h(SessionListSheet, { visible: true, onClose, machineId: "computer", selectedSessionId: "selected" });
  try {
    fixture.directory = [session("First computer session", Date.now())];
    await act(async () => root.render(sheet()));
    const oldPress = fixture.rowPress!;
    fixture.epoch++;
    fixture.directory = [session("Re-paired computer session", Date.now())];
    await act(async () => { oldPress(); root.render(sheet()); });
    expect(fixture.replace).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Computer connection changed.");
    expect(container.textContent).not.toContain("Re-paired computer session");

    await act(async () => root.render(null));
    await act(async () => root.render(sheet()));
    expect(container.textContent).toContain("Re-paired computer session");
    await act(async () => { fixture.rowPress!(); fixture.rowPress!(); });
    expect(fixture.replace).toHaveBeenCalledExactlyOnceWith({
      pathname: "/session/[id]", params: { id: "Re-paired computer session", projectId: "project", machineId: "computer" },
    });
    expect(onClose).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
