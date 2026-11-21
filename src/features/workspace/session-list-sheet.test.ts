import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { QueryLike } from "@/ui/query-presentation";
import { SessionListSheet } from "./session-list-sheet";

const fixture = vi.hoisted(() => ({ activeId: "computer", directory: [] as unknown[], error: undefined as unknown, readiness: "ready" }));
vi.mock("expo-router", () => ({ router: { replace: vi.fn() } }));
vi.mock("react-native", () => ({
  FlatList: ({ data, ListHeaderComponent, ListEmptyComponent, renderItem }: {
    data: { key: string }[];
    ListHeaderComponent?: ReactNode;
    ListEmptyComponent?: ReactNode;
    renderItem: (entry: { item: { key: string } }) => ReactNode;
  }) => h("section", null, ListHeaderComponent, data.length ? data.map((item) =>
    h("div", { key: item.key }, renderItem({ item }))) : ListEmptyComponent),
}));
vi.mock("@/state/machines", () => ({ useMachines: (select: (state: typeof fixture) => string) => select(fixture) }));
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
vi.mock("./session-list-row", () => ({ SessionListRow: ({ session }: { session: { title: string } }) => h("p", null, session.title) }));
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
  fixture.directory = [];
  fixture.error = undefined;
  fixture.readiness = "ready";
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
  expect(view).not.toContain("No sessions in the last 7 days");
});

it("keeps a pending connection and a changed computer distinct from a true empty list", () => {
  fixture.readiness = "waiting";
  expect(render()).toContain("Waiting for a connection");
  fixture.activeId = "another-computer";
  expect(render()).toContain("Computer connection changed.");
  fixture.activeId = "computer";
  fixture.readiness = "ready";
  expect(render()).toContain("No sessions in the last 7 days");
});
