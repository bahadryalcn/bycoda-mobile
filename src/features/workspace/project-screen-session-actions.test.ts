// @vitest-environment jsdom
import { act, createElement as h, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { getQueryPresentation, type QueryLike } from "@/ui/query-presentation";
import { ProjectSessions } from "./sessions-panel";

vi.mock("@/ui/swipe-actions", () => ({
  SwipeActionsGroup: ({ children }: { children: ReactNode }) => children,
}));

const fixture = vi.hoisted(() => ({
  query: {} as QueryLike,
  locked: false,
  epoch: 1,
  navigate: vi.fn(),
  create: vi.fn<(created: (id: string) => void) => Promise<boolean>>(),
}));

vi.mock("expo-router", () => ({ router: { navigate: fixture.navigate } }));
vi.mock("@/state/connection-scope", () => ({
  useConnectionScope: () => {
    const epoch = fixture.epoch;
    return { token: String(epoch), isCurrent: () => fixture.epoch === epoch };
  },
}));
vi.mock("react-native", () => ({ View: ({ children }: { children: ReactNode }) => h("div", null, children) }));
vi.mock("@/state/form-draft", () => ({ useFormDraft: () => ({ values: {} }) }));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({ id: "computer" }),
  useMachines: { getState: () => ({ activeId: "computer" }) },
}));
vi.mock("@/state/queries", () => ({
  useHostClient: () => undefined,
  useHostReadActive: () => false,
  useHostQuery: ([key]: string[]) => key === "sessions" ? fixture.query : {},
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ uiStyles: {} }) }));
vi.mock("@/ui/screen-content-insets", () => ({ useScreenContentInsets: () => ({ bottom: 0 }) }));
vi.mock("@/ui/hierarchy-frame", () => ({ HierarchyWidthProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/ui/primitives", () => ({
  Body: ({ children }: { children: ReactNode }) => h("h2", null, children),
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => h("button", { onClick: onPress }, label),
  Sheet: ({ title, children }: { title: string; children: ReactNode }) => h("section", { "aria-label": title }, children),
  FormActions: ({ submitLabel, onSubmit, disabled }: { submitLabel: string; onSubmit: () => void; disabled?: boolean }) =>
    h("button", { onClick: onSubmit, disabled }, submitLabel),
  ScreenList: ({ data, ListEmptyComponent, ListHeaderComponent }: { data: unknown[]; ListEmptyComponent?: ReactNode; ListHeaderComponent?: ReactNode }) =>
    h("div", null, ListHeaderComponent, data.length ? h("p", null, "Session rows") : ListEmptyComponent),
  QueryState: ({ query, empty, emptyAction, loadingLabel }: {
    query: QueryLike;
    empty?: string;
    emptyAction?: { label: string };
    loadingLabel: string;
  }) => {
    switch (getQueryPresentation(query, !!empty)) {
      case "empty": return h("section", null, empty, emptyAction && h("button", null, emptyAction.label));
      case "loading": return h("p", null, loadingLabel);
      case "error": return h("button", null, "Retry");
      default: return null;
    }
  },
}));
vi.mock("./agent-model-fields", () => ({ AgentModelFields: () => null }));
vi.mock("./agent-option-icons", () => ({ PermissionField: () => null }));
vi.mock("./session-clock", () => ({ useSnoozeNow: () => 0 }));
vi.mock("./session-done-store", () => ({ useUnseenDoneIds: () => new Set() }));
vi.mock("./session-folder-row", () => ({}));
vi.mock("./session-list-row", () => ({}));
vi.mock("./session-shelf-header", () => ({}));
vi.mock("./shared", () => ({ CommandError: () => null }));
vi.mock("./use-create-session", () => ({
  useCreateSession: () => ({
    selection: {}, choices: [], command: {}, catalog: {}, locked: fixture.locked, canStart: !fixture.locked, create: fixture.create,
  }),
}));

function renderProjectSessions() {
  return renderToStaticMarkup(h(ProjectSessions, {
    projectId: "project",
    canReadProject: () => true,
    renderFrame: (content, { showCreateInHeader, createDisabled }) => h(
      "main", null,
      showCreateInHeader && h("button", { "data-header": true, disabled: createDisabled }, "New session"),
      content,
    ),
  }));
}

beforeEach(() => {
  fixture.query = { status: "success", data: [] };
  fixture.locked = false;
  fixture.epoch = 1;
  fixture.navigate.mockClear();
  fixture.create.mockReset().mockResolvedValue(true);
});

it("shows one New session action, in the empty state of a loaded project", () => {
  const view = renderProjectSessions();
  expect(view).toContain("No sessions yet.");
  expect(view).toContain("<button>New session</button>");
  expect(view).not.toContain("data-header");
});

it("keeps New session in the header when the project has session rows", () => {
  fixture.query.data = [{ id: "session", title: "Existing session", status: "idle", updatedAt: 1 }];
  const view = renderProjectSessions();
  expect(view).toContain("Session rows");
  expect(view).toContain('<button data-header="true">New session</button>');
});

it("shows the initial loading state without briefly exposing a creation action", () => {
  fixture.query = { status: "pending", fetchStatus: "fetching" };
  const view = renderProjectSessions();
  expect(view).toContain("Loading sessions…");
  expect(view).not.toContain("New session");
});

it("keeps Retry visible after a failed read without showing the empty state action", () => {
  fixture.query = { status: "error", error: new Error("Unavailable") };
  const view = renderProjectSessions();
  expect(view).toContain("<button>Retry</button>");
  expect(view).not.toContain("<button>New session</button>");
});

it("does not offer another creation action while a session command is locked", () => {
  fixture.locked = true;
  expect(renderProjectSessions()).not.toContain("New session");
});

it("identifies the project archive and returns to active sessions directly from the list", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const button = (label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === label);
  try {
    await act(async () => root.render(h(ProjectSessions, {
      projectId: "project",
      canReadProject: () => true,
      renderFrame: (content, { toggleArchived }) => h("main", null,
        h("button", { onClick: toggleArchived }, "Archive"), content),
    })));
    expect(button("Active sessions")).toBeUndefined();

    await act(async () => button("Archive")!.click());
    expect(container.querySelector("h2")?.textContent).toBe("Archived sessions");
    expect(container.textContent).toContain("No archived sessions.");

    await act(async () => button("Active sessions")!.click());
    expect(button("Active sessions")).toBeUndefined();
    expect(container.textContent).toContain("No sessions yet.");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("retires a project creation panel and old callbacks after same-row re-pairing", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const panel = () => h(ProjectSessions, {
    projectId: "project", initialCreating: true, canReadProject: () => true,
    renderFrame: (content) => content,
  });
  const start = () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Start session");
  try {
    await act(async () => root.render(panel()));
    await act(async () => start()!.click());
    const lateCreated = fixture.create.mock.calls[0][0];
    await act(async () => root.render(panel()));
    expect(start()).toBeDefined();

    fixture.epoch++;
    await act(async () => root.render(panel()));
    expect(start()).toBeUndefined();
    await act(async () => lateCreated("old-session"));
    expect(fixture.navigate).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
