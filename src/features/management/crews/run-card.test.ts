// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CrewRunView } from "@/remote/contracts/crews";
import { CrewRunCard } from "./run-card";

const state = vi.hoisted(() => ({
  machine: { id: "pc", capabilities: ["crews.v1", "crews.run-delete.v1"] },
  activeId: "pc",
  actions: new Map<string, { disabled?: boolean; onPress: () => void }>(),
  writes: vi.fn(),
  invalidate: vi.fn(),
  push: vi.fn(),
}));
vi.mock("expo-router", () => ({ router: { navigate: state.push } }));
vi.mock("lucide-react-native/icons/message-square", () => ({ default: () => null }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => state.machine,
  useMachines: { getState: () => ({ activeId: state.activeId }) },
}));
vi.mock("@/state/queries", () => ({
  hostKey: (machine: string, keys: unknown[]) => ["machine", machine, ...keys],
  useHostMutation: (method: string) => ({
    isPending: false,
    mutate: (...args: unknown[]) => state.writes(method, ...args),
  }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({
  useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }),
}));
vi.mock("lucide-react-native/icons/trash-2", () => ({ default: () => null }));
vi.mock("panelui-native/components/progress", () => ({ Progress: () => null }));
vi.mock("../shared/record-bits", () => ({
  RecordTrailing: ({ children }: PropsWithChildren) => createElement("div", null, children),
  useMenuGlyph: () => () => null,
  useRelativeTime: () => () => "soon",
  joinMeta: (parts: unknown[]) => parts.filter(Boolean).join(" · "),
}));
vi.mock("../shared/format", () => ({
  stamp: (value?: number) => (value === undefined ? "—" : `DATE:${value}`),
}));
vi.mock("@/ui/confirm", () => ({
  confirmAction: (_title: string, _detail: string, _label: string, action: () => void) => action(),
}));
vi.mock("./runtime-panel", () => ({
  CrewRuntimePanel: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
vi.mock("./member-lines", () => ({ MemberLines: () => null }));
vi.mock("../shared/status", () => ({
  Status: ({ value }: { value: string }) => createElement("span", null, value),
  statusLabel: (value: string) => value,
}));
vi.mock("@/ui/record-card", () => ({
  RecordCard: ({
    children,
    footer,
    details,
    menu,
    metadata,
  }: PropsWithChildren<Record<string, any>>) =>
    createElement("div", null, metadata, children, footer, details, menu),
}));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const action = ({
    label,
    disabled,
    onPress,
  }: {
    label: string;
    disabled?: boolean;
    onPress: () => void;
  }) => {
    state.actions.set(label, { disabled, onPress });
    return null;
  };
  return {
    Body: wrapper,
    Row: wrapper,
    Stack: wrapper,
    NavigationGroup: wrapper,
    Button: action,
    IconButton: action,
    NavigationRow: ({
      label,
      detail,
      supporting,
      disabled,
      onPress,
      accessibilityLabel,
    }: {
      label: string;
      detail?: string;
      supporting?: import("react").ReactNode;
      disabled?: boolean;
      onPress: () => void;
      accessibilityLabel?: string;
    }) => {
      state.actions.set(label, { disabled, onPress });
      return createElement(
        "button",
        { disabled, "aria-label": accessibilityLabel },
        label,
        detail,
        supporting,
      );
    },
    ErrorNotice: ({ error }: { error?: string }) =>
      error ? createElement("p", { role: "alert" }, error) : null,
    ErrorText: ({ error }: { error?: string }) =>
      error ? createElement("p", { role: "alert" }, error) : null,
    MutationState: () => null,
    ActionMenu: ({
      actions,
    }: {
      actions: Array<false | { label: string; disabled?: boolean; onPress: () => void }>;
    }) => {
      for (const entry of actions) if (entry) state.actions.set(entry.label, entry);
      return null;
    },
  };
});
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
const value = (): CrewRunView =>
  ({
    id: "run",
    projectId: "project",
    updatedAt: 42,
    status: "paused",
    coordinatorSessionId: "lead",
    coordinatorStatus: "idle",
    definition: { name: "Crew", agents: [] },
    tasks: [],
    assignments: [],
    messages: [],
  }) as unknown as CrewRunView;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.activeId = "pc";
  state.machine = { id: "pc", capabilities: ["crews.v1", "crews.run-delete.v1"] };
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  state.actions.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("offers deletion with a conflict token instead of a redundant Stop for idle paused work", async () => {
  await act(async () => root.render(createElement(CrewRunCard, { run: value() })));
  expect(state.actions.has("Stop work")).toBe(false);
  expect(state.actions.get("Delete work")?.disabled).toBe(false);
  state.actions.get("Delete work")!.onPress();
  expect(state.writes).toHaveBeenCalledWith("crews.deleteRun", {
    projectId: "project",
    runId: "run",
    expectedUpdatedAt: 42,
  });
});

it("refreshes a failed Stop against its original machine without repeating it", async () => {
  await act(async () =>
    root.render(createElement(CrewRunCard, { run: { ...value(), coordinatorStatus: "running" } })),
  );
  state.actions.get("Stop work")!.onPress();
  const options = state.writes.mock.calls[0][2];
  state.activeId = "other";
  options.onError(new Error("Partial stop"));
  expect(state.invalidate).toHaveBeenCalledWith({
    queryKey: ["machine", "pc", "crews", "project"],
  });
  expect(state.writes).toHaveBeenCalledTimes(1);
});

it("keeps cancellation for older hosts and blocks session navigation after a machine switch", async () => {
  await act(async () =>
    root.render(createElement(CrewRunCard, { run: { ...value(), coordinatorStatus: undefined } })),
  );
  expect(state.actions.has("Stop work")).toBe(true);
  expect(state.actions.get("Delete work")?.disabled).toBe(true);
  state.activeId = "other";
  state.actions.get("Coordinator session")!.onPress();
  expect(state.push).not.toHaveBeenCalled();
});

it("keeps complete task recovery outside a disabled session target and speaks its status", async () => {
  const error =
    "Worker interrupted. Reconnect to the original computer and inspect preserved files before retrying. RECOVERY_END";
  const task = {
    id: "task",
    title: "Retain full recovery",
    status: "blocked",
    error,
  } as CrewRunView["tasks"][number];
  await act(async () =>
    root.render(createElement(CrewRunCard, { run: { ...value(), tasks: [task] } })),
  );
  const alert = container.querySelector('[role="alert"]');
  expect(alert?.textContent).toBe(error);
  expect(alert?.closest("button")).toBeNull();
  expect(state.actions.get(task.title)?.disabled).toBe(true);
  const row = container.querySelector("button");
  expect(row?.getAttribute("aria-label")).toContain("blocked");
  expect(row?.getAttribute("aria-label")).not.toContain(error);
  expect(state.writes).not.toHaveBeenCalled();
});

it.each(["active", "paused", "finished"] as const)(
  "shows authoritative creation metadata rather than inferred execution duration for %s work",
  async (status) => {
    await act(async () =>
      root.render(
        createElement(CrewRunCard, {
          run: { ...value(), status, createdAt: 1234, updatedAt: 987654321 },
        }),
      ),
    );
    expect(container.textContent).toContain("Created: DATE:1234");
    expect(container.textContent).not.toContain("DATE:987654321");
  },
);
