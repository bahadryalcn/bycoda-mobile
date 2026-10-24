// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ProviderJiraBoards } from "./jira-board-screen";

const state = vi.hoisted(() => ({ requests: [] as unknown[] }));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({ id: "machine", capabilities: ["inbox.jiraBoard.v1"] }),
  useMachines: { getState: () => ({ activeId: "machine", selectedProjectId: "project" }) },
}));
vi.mock("@/ui/copy", () => ({
  useCopy: () => (_tr: string, en: string, params?: Record<string, string | number>) =>
    en.replace(/\{(\w+)\}/g, (key, name: string) => String(params?.[name] ?? key)),
}));
vi.mock("./provider-model", () => ({ isInboxOriginCurrent: () => true }));
vi.mock("./jira-board-issue", () => ({ JiraBoardIssueActions: () => null }));
vi.mock("./provider-queries", () => ({
  useInboxRead: (request: { action: string }, enabled: boolean) => {
    if (enabled) state.requests.push(request);
    return {
      data: request.action === "jira-boards" ? [{ id: 1, name: "Fixture board" }] : snapshot,
      isSuccess: enabled,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    };
  },
}));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  return {
    Body: Wrapper,
    Sheet: Wrapper,
    Row: Wrapper,
    Stack: Wrapper,
    Notice: ({ message }: { message: string }) => createElement("span", null, message),
    QueryState: () => null,
    Button: ({
      label,
      disabled,
      onPress,
    }: {
      label: string;
      disabled?: boolean;
      onPress?: () => void;
    }) => createElement("button", { disabled, onClick: onPress }, label),
    NavigationRow: ({ label }: { label: string }) => createElement("span", null, label),
    SelectField: ({
      label,
      value,
      options,
      onChange,
    }: {
      label: string;
      value: string;
      options: Array<{ value: string; label: string }>;
      onChange: (value: string) => void;
    }) =>
      createElement(
        "select",
        {
          "aria-label": label,
          value,
          onChange: (event: { target: { value: string } }) => onChange(event.target.value),
        },
        createElement("option", { value: "" }, ""),
        options
          .filter((option) => option.value)
          .map((option) =>
            createElement("option", { key: option.value, value: option.value }, option.label),
          ),
      ),
    ScreenList: ({
      header,
      data,
      renderItem,
    }: {
      header: ReactNode;
      data: unknown[];
      renderItem: (row: { item: unknown }) => ReactNode;
    }) =>
      createElement(
        "div",
        null,
        header,
        data.map((item, index) => createElement("div", { key: index }, renderItem({ item }))),
      ),
  };
});
let snapshot: {
  board: { id: number; name: string };
  scope: { scope: string };
  configuration: { sprints: never[]; columns: Array<{ name: string; statusIds: string[] }> };
  page: {
    issues: Array<{ identifier: string; title: string; statusId: string; state: string }>;
    nextPageToken: string;
  };
};
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
async function mount(empty = false) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  snapshot = {
    board: { id: 1, name: "Fixture board" },
    scope: { scope: "board" },
    configuration: {
      sprints: [],
      columns: [
        { name: "Todo", statusIds: ["todo"] },
        { name: "Done", statusIds: ["done"] },
      ],
    },
    page: {
      issues: empty
        ? []
        : [{ identifier: "ABC-1", title: "Fixture issue", statusId: "todo", state: "To do" }],
      nextPageToken: "page2",
    },
  };
  root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(ProviderJiraBoards, {
        origin: { machineId: "machine", projectId: "project" },
        canRead: true,
        canWrite: true,
        onClose: vi.fn(),
      }),
    ),
  );
  await select("Jira board", "1");
}
async function select(label: string, value: string) {
  await act(async () => {
    const node = container.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
    node.value = value;
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
afterEach(async () => {
  await act(async () => root?.unmount());
  state.requests = [];
  vi.unstubAllGlobals();
});
it("explains a page-local empty column and clears only that filter", async () => {
  await mount();
  await select("Column", "2");
  expect(container.textContent).toContain("Showing 0 of 1 issues on this page.");
  expect(container.textContent).toContain("No issues on this page match the selected column.");
  expect(container.textContent).not.toContain("ABC-1");
  const clear = [...container.querySelectorAll("button")].find(
    (node) => node.textContent === "Clear column filter",
  )!;
  await act(async () => clear.click());
  expect(container.textContent).toContain("ABC-1");
  expect(container.textContent).toContain("Issues on this page: 1");
  expect(
    (container.querySelector('select[aria-label="Jira board"]') as HTMLSelectElement).value,
  ).toBe("1");
  expect(container.textContent).toContain("Next page");
  expect(
    state.requests.every((request) =>
      ["jira-boards", "jira-board-read"].includes((request as { action: string }).action),
    ),
  ).toBe(true);
});
it("distinguishes an empty page without claiming the full board is empty", async () => {
  await mount(true);
  expect(container.textContent).toContain("Issues on this page: 0");
  expect(container.textContent).toContain("No issues on this page.");
  expect(container.textContent).not.toContain("Clear column filter");
  expect(container.textContent).toContain("Next page");
});
