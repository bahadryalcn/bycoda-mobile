// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import type { GoalEditorProps } from "./types";
const fixture = vi.hoisted(() => ({
  current: true,
  data: undefined as undefined | { definitions: { id: string; name: string }[] },
  pending: true,
  error: false,
  refetch: vi.fn(async () => ({})),
  mutate: vi.fn(),
  mutateAsync: vi.fn(async ({ goal }: { goal: { id: string } }) => goal),
  selects: new Map<
    string,
    {
      value?: string;
      disabled?: boolean;
      options: { value: string }[];
      onChange(value: string): void;
    }
  >(),
  fields: new Map<string, { onChangeText(value: string): void }>(),
  submit: undefined as undefined | { disabled: boolean; onSubmit(): void },
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/motion", () => ({ haptic: { success: vi.fn() } }));
vi.mock("@/ui/query-state", () => ({ useReadRetryNotice: () => true }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({ requestClose: vi.fn() }) }));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({ id: "host", providers: [], capabilities: ["crews.tasks.v1"] }),
}));
vi.mock("@/state/connection-scope", () => ({
  useConnectionScope: () => ({ token: "epoch", isCurrent: () => fixture.current }),
}));
vi.mock("@/state/queries", () => ({
  useHostClient: () => ({ request: fixture.mutate }),
  useHostQuery: () => ({
    data: fixture.data,
    isPending: fixture.pending,
    isSuccess: !fixture.pending && !fixture.error,
    isError: fixture.error,
    isFetching: false,
    refetch: fixture.refetch,
  }),
}));
vi.mock("../shared/agent", () => ({
  initialAgent: () => ({
    harness: "codex",
    model: "codex:model",
    modelSettings: {},
    runtimeMode: "supervised",
    maxRunMinutes: 0,
  }),
  useEffectiveAgent: (value: unknown) => value,
}));
vi.mock("../shared/agent-fields", () => ({ AgentFields: () => null }));
vi.mock("../shared/format", () => ({ identifier: () => "new-goal" }));
vi.mock("../../workspace/activity-model", () => ({
  deduplicateProjects: (projects: unknown[]) => projects,
}));
vi.mock("../crews/model", () => ({ validateCrewDirectory: (value: unknown) => value }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Body: Group,
    Stack: Group,
    Disclosure: Group,
    Section: Group,
    NavigationGroup: Group,
    Row: Group,
    ToggleField: () => null,
    MutationState: () => null,
    MultiSelectField: () => null,
    Field: ({ label, ...props }: { label: string; onChangeText(value: string): void }) => {
      fixture.fields.set(label, props);
      return null;
    },
    SegmentedControl: ({
      label,
      ...props
    }: {
      label: string;
      value?: string;
      options: { value: string }[];
      onChange(value: string): void;
    }) => {
      fixture.selects.set(label, props);
      return null;
    },
    SelectField: ({
      label,
      ...props
    }: {
      label: string;
      value?: string;
      disabled?: boolean;
      options: { value: string }[];
      onChange(value: string): void;
    }) => {
      fixture.selects.set(label, props);
      return null;
    },
    QueryState: ({ query }: { query: { isPending: boolean; isError: boolean; refetch(): void } }) =>
      createElement(
        "aside",
        null,
        query.isPending
          ? "Loading crews"
          : query.isError
            ? createElement("button", { onClick: () => query.refetch() }, "Retry")
            : null,
      ),
    Notice: ({
      message,
      retryLabel,
      onRetry,
    }: {
      message: string;
      retryLabel?: string;
      onRetry?(): void;
    }) =>
      createElement(
        "aside",
        null,
        message,
        retryLabel ? createElement("button", { onClick: onRetry }, retryLabel) : null,
      ),
    FormActions: (props: { disabled: boolean; onSubmit(): void }) => {
      fixture.submit = props;
      return null;
    },
  };
});
import { GoalEditor } from "./goal-editor";
import { HostGoalInputSchema } from "../../../../../src/shared/model/host-contracts/goals";
beforeEach(() => {
  fixture.current = true;
  fixture.data = undefined;
  fixture.pending = true;
  fixture.error = false;
  fixture.refetch.mockClear();
  fixture.mutate.mockClear();
  fixture.mutateAsync.mockClear();
  fixture.selects.clear();
  fixture.fields.clear();
});
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"),
    root = createRoot(container);
  const render = () =>
    root.render(
      createElement(GoalEditor, {
        projectId: "project",
        projects: [],
        providers: ["codex"],
        busy: false,
        create: {
          isPending: false,
          mutate: fixture.mutate,
          mutateAsync: fixture.mutateAsync,
        } as unknown as GoalEditorProps["create"],
        onClose: vi.fn(),
      }),
    );
  await act(async () => render());
  return {
    container,
    render,
    close: async () => {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    },
  };
}
it("shows pending crews without claiming the list is empty", async () => {
  const view = await mount();
  try {
    expect(view.container.textContent).toContain("Loading crews");
    expect(view.container.textContent).not.toContain("No crews yet");
    expect(fixture.selects.has("Worker type")).toBe(false);
    expect(fixture.mutate).not.toHaveBeenCalled();
  } finally {
    await view.close();
  }
});
it("keeps a selected crew and draft through refresh failure, with a read-only retry", async () => {
  fixture.pending = false;
  fixture.data = { definitions: [{ id: "crew", name: "Review team" }] };
  const view = await mount();
  try {
    await act(async () => {
      fixture.selects.get("Worker type")!.onChange("crew");
      fixture.fields.get("Title")!.onChangeText("Retained title");
      fixture.fields.get("Desired outcome")!.onChangeText("Retained outcome");
    });
    fixture.error = true;
    await act(async () => view.render());
    expect(fixture.selects.get("Crew")?.value).toBe("crew");
    expect(fixture.submit?.disabled).toBe(true);
    expect(view.container.textContent).toContain(
      "The crew list could not be refreshed. Your selection is kept; retry before saving.",
    );
    await act(async () => view.container.querySelector("button")!.click());
    expect(fixture.refetch).toHaveBeenCalledOnce();
    expect(fixture.mutate).not.toHaveBeenCalled();
    fixture.error = false;
    await act(async () => view.render());
    expect(fixture.submit?.disabled).toBe(false);
    fixture.current = false;
    await act(async () => fixture.submit!.onSubmit());
    expect(fixture.mutate).not.toHaveBeenCalled();
  } finally {
    await view.close();
  }
});
it("offers retry for initial failure without a false empty result", async () => {
  fixture.pending = false;
  fixture.error = true;
  const view = await mount();
  try {
    expect(view.container.textContent).not.toContain("No crews yet");
    await act(async () => view.container.querySelector("button")!.click());
    expect(fixture.refetch).toHaveBeenCalledOnce();
    expect(fixture.mutate).not.toHaveBeenCalled();
  } finally {
    await view.close();
  }
});

it("sends the crew choice as the Host contract executor", async () => {
  fixture.pending = false;
  fixture.data = { definitions: [{ id: "crew", name: "Review team" }] };
  const view = await mount();
  try {
    await act(async () => {
      fixture.selects.get("Worker type")!.onChange("crew");
      fixture.fields.get("Title")!.onChangeText("Crew epic");
      fixture.fields.get("Desired outcome")!.onChangeText("Ship it");
    });
    await act(async () => view.render());
    expect(fixture.submit?.disabled).toBe(false);
    await act(async () => fixture.submit!.onSubmit());
    expect(fixture.mutateAsync).toHaveBeenCalledOnce();
    const { goal } = fixture.mutateAsync.mock.calls[0][0] as { goal: Record<string, unknown> };
    expect(goal.executor).toEqual({ kind: "crew", crewDefinitionId: "crew" });
    expect("crewDefinitionId" in goal).toBe(false);
    const { expectedAbsent: _ignored, ...input } = goal;
    expect(HostGoalInputSchema.safeParse(input).success).toBe(true);
  } finally {
    await view.close();
  }
});
