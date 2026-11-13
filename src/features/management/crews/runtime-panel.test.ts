// @vitest-environment jsdom
import { act, createElement, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CrewRunDetail } from "@/remote/contracts/crews";
import { CrewRuntimePanel } from "./runtime-panel";

const state = vi.hoisted(() => ({
  detail: undefined as CrewRunDetail | undefined,
  activeId: "pc",
  supported: true,
  actions: new Map<string, { disabled?: boolean; onPress: () => void }>(),
  confirmations: [] as Array<() => void>,
  writes: vi.fn(),
  navigate: vi.fn(),
  epoch: "epoch-a",
  receipts: 0,
  requestFails: false,
  refetch: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("expo-router", () => ({ router: { push: (target: unknown) => state.navigate(target) } }));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({
    id: "pc",
    capabilities: state.supported ? ["crews.v1", "crews.tasks.v1"] : [],
  }),
  useMachines: { getState: () => ({ activeId: state.activeId }) },
}));
vi.mock("@/state/connection-scope", () => ({
  useConnectionScope: () => {
    const token = state.epoch;
    return { token, isCurrent: () => state.epoch === token };
  },
}));
vi.mock("@/state/queries", () => ({
  useHostQuery: () => ({ data: state.detail, isFetching: false, refetch: state.refetch }),
  useHostMutation: (method: string) => ({
    isPending: false,
    reset: state.reset,
    mutate: (
      input: unknown,
      callbacks?: { onError?(error: unknown): void; onSuccess?(): void },
    ) => {
      state.writes(method, input);
      if (method === "crews.request") {
        if (state.requestFails) callbacks?.onError?.(new Error("Lost acknowledgement"));
        else callbacks?.onSuccess?.();
      }
    },
    mutateAsync: async (input: unknown) => {
      state.writes(method, input);
    },
  }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({
  confirmAction: (_title: string, _detail: string, _label: string, callback: () => void) =>
    state.confirmations.push(callback),
}));
vi.mock("../shared/format", () => ({ identifier: () => `receipt-${++state.receipts}` }));
vi.mock("./assignment-editor", () => ({ CrewAssignmentEditor: () => null }));
vi.mock("./member-inspection", () => ({ CrewMemberInspection: () => null }));
vi.mock("../../workspace/question-card", () => ({
  QuestionCard: ({ disabled }: { disabled: boolean }) => {
    const [draft, setDraft] = useState("");
    return createElement(
      "div",
      null,
      createElement("textarea", {
        "aria-label": "Question draft",
        value: draft,
        disabled,
        readOnly: true,
      }),
      createElement("button", { onClick: () => setDraft("Retained response") }, "Edit answer"),
    );
  },
}));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Body: Wrapper,
    Row: Wrapper,
    Stack: Wrapper,
    Sheet: Wrapper,
    QueryState: () => null,
    MutationState: () => null,
    Notice: ({
      message,
      action,
    }: {
      message: string;
      action?: { label: string; onPress: () => void };
    }) => {
      if (action) state.actions.set(action.label, action);
      return createElement(
        "div",
        null,
        message,
        action && createElement("button", { onClick: action.onPress }, action.label),
      );
    },
    Disclosure: ({ label, children }: PropsWithChildren<{ label: string }>) =>
      createElement("div", null, label, children),
    Field: ({
      label,
      value,
      onChangeText,
      editable,
    }: {
      label: string;
      value: string;
      onChangeText(value: string): void;
      editable?: boolean;
    }) =>
      createElement("input", {
        "aria-label": label,
        value,
        disabled: editable === false,
        onChange: (event) => onChangeText(event.currentTarget.value),
      }),
    Button: ({
      label,
      disabled,
      onPress,
    }: {
      label: string;
      disabled?: boolean;
      onPress: () => void;
    }) => {
      state.actions.set(label, { disabled, onPress });
      return createElement("button", { disabled, onClick: onPress }, label);
    },
  };
});

const detail = (): CrewRunDetail =>
  ({
    id: "run",
    projectId: "project",
    status: "active",
    updatedAt: 1,
    definition: { agents: [], policy: { delegateApprovals: true } },
    tasks: [],
    assignments: [],
    messages: [],
    pendingInputs: [
      {
        taskId: "task",
        sessionId: "question",
        targetRunId: "turn-q",
        question: { requestId: 10, questions: [] },
      },
      {
        taskId: "task",
        sessionId: "approval",
        targetRunId: "turn-a",
        approval: { requestId: 11, occurrenceId: "11111111-1111-4111-8111-111111111111" },
        text: "Approve this request?",
      },
    ],
  }) as unknown as CrewRunDetail;
let root: ReturnType<typeof createRoot>;
const container = document.createElement("div");
async function render() {
  await act(async () =>
    root.render(
      createElement(
        CrewRuntimePanel,
        { run: detail() },
        createElement("p", null, "Task inventory"),
      ),
    ),
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.detail = detail();
  state.activeId = "pc";
  state.supported = true;
  state.epoch = "epoch-a";
  state.receipts = 0;
  state.requestFails = false;
  state.refetch.mockImplementation(async () => ({ data: state.detail }));
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  state.actions.clear();
  state.confirmations = [];
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("places required inputs before the task inventory and technical disclosures", async () => {
  await render();
  const text = container.textContent!;
  expect(text.indexOf("Approve this request?")).toBeLessThan(text.indexOf("Task inventory"));
  expect(text.indexOf("Task inventory")).toBeLessThan(text.indexOf("Member capabilities"));
  expect(state.writes).not.toHaveBeenCalled();
});

it("retains the question owner and selection across polling and pending-input reordering", async () => {
  await render();
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Edit answer")!
      .click(),
  );
  const field = container.querySelector("textarea")!;
  field.focus();
  field.setSelectionRange(2, 9);
  state.detail = {
    ...state.detail!,
    updatedAt: 2,
    pendingInputs: [...state.detail!.pendingInputs].reverse(),
  };
  await render();
  expect(container.querySelector("textarea")).toBe(field);
  expect(field.value).toBe("Retained response");
  expect(field.selectionStart).toBe(2);
  expect(field.selectionEnd).toBe(9);
  expect(document.activeElement).toBe(field);
  state.detail = undefined;
  await render();
  expect(container.textContent).toContain("Task inventory");
});

it("keeps permission decisions behind confirmation and the original active machine", async () => {
  await render();
  state.actions.get("Allow")!.onPress();
  expect(state.writes).not.toHaveBeenCalled();
  state.activeId = "other";
  state.confirmations.pop()!();
  expect(state.writes).not.toHaveBeenCalled();
  state.activeId = "pc";
  state.actions.get("Allow")!.onPress();
  state.confirmations.pop()!();
  expect(state.writes).toHaveBeenCalledWith(
    "crews.respond",
    expect.objectContaining({
      runId: "run",
      sessionId: "approval",
      targetRunId: "turn-a",
      approvalId: 11,
      approvalOccurrenceId: "11111111-1111-4111-8111-111111111111",
      requestId: expect.stringMatching(/^receipt-/),
      decision: "allow",
    }),
  );
});

it("keeps delegated input controls disabled without the existing policy permission", async () => {
  state.detail!.definition.policy.delegateApprovals = false;
  await render();
  expect(state.actions.get("Allow")?.disabled).toBe(true);
  expect(state.actions.get("Deny")?.disabled).toBe(true);
  expect(container.querySelector("textarea")?.disabled).toBe(true);
  expect(container.textContent).toContain("Delegated approval is unavailable");
  expect(container.textContent!.split("Delegated approval is unavailable")).toHaveLength(2);
  expect(state.writes).not.toHaveBeenCalled();
});

it("opens each blocked request's exact member session without answering or granting permission", async () => {
  state.detail!.definition.policy.delegateApprovals = false;
  await render();
  const actions = [...container.querySelectorAll("button")].filter(
    (button) => button.textContent === "Open session",
  );
  expect(actions).toHaveLength(2);
  for (const [index, id] of ["question", "approval"].entries()) {
    await act(async () => actions[index].click());
    expect(state.navigate).toHaveBeenNthCalledWith(index + 1, {
      pathname: "/session/[id]",
      params: { id, machineId: "pc", projectId: "project" },
    });
  }
  expect(state.detail!.definition.policy.delegateApprovals).toBe(false);
  expect(state.writes).not.toHaveBeenCalled();
});

it("explains an unavailable response target and keeps healthy inputs free of recovery chrome", async () => {
  await render();
  expect(container.textContent).not.toContain("Open session");
  state.detail!.pendingInputs = [{ ...state.detail!.pendingInputs[1], targetRunId: undefined }];
  await render();
  expect(container.textContent).toContain("Respond to this request in the member session.");
  expect(state.actions.get("Allow")?.disabled).toBe(true);
  state.actions.get("Open session")!.onPress();
  expect(state.navigate).toHaveBeenCalledWith(
    expect.objectContaining({ params: { id: "approval", machineId: "pc", projectId: "project" } }),
  );
  expect(state.writes).not.toHaveBeenCalled();
});

it.each(["machine", "access", "removed", "target", "project", "recovered"])(
  "retires recovery callbacks after %s changes",
  async (change) => {
    state.detail!.definition.policy.delegateApprovals = false;
    await render();
    const retained = state.actions.get("Open session")!.onPress;
    if (change === "machine") state.activeId = "other";
    if (change === "access") state.supported = false;
    if (change === "removed") state.detail!.pendingInputs = [];
    if (change === "target")
      state.detail!.pendingInputs[1] = {
        ...state.detail!.pendingInputs[1],
        sessionId: "replacement",
      };
    if (change === "project") state.detail!.projectId = "replacement-project";
    if (change === "recovered") state.detail!.definition.policy.delegateApprovals = true;
    // A live machine switch must be rejected even before React processes it.
    if (change !== "machine") await render();
    retained();
    expect(state.navigate).not.toHaveBeenCalled();
    expect(state.writes).not.toHaveBeenCalled();
  },
);

it("keeps recovery usable through polling but omits it without a session or supported owner", async () => {
  state.detail!.definition.policy.delegateApprovals = false;
  await render();
  const retained = state.actions.get("Open session")!.onPress;
  state.detail = { ...state.detail!, updatedAt: 2 };
  await render();
  retained();
  expect(state.navigate).toHaveBeenCalledTimes(1);
  state.detail!.pendingInputs = state.detail!.pendingInputs.map((input) => ({
    ...input,
    sessionId: "",
  }));
  await render();
  expect(container.textContent).not.toContain("Open session");
  state.detail = detail();
  state.detail.definition.policy.delegateApprovals = false;
  state.supported = false;
  await render();
  expect(container.textContent).not.toContain("Open session");
  expect(state.writes).not.toHaveBeenCalled();
});

it("keeps a sent occurrence held through polling but gives a new occurrence its own command identity", async () => {
  await render();
  await act(async () => {
    state.actions.get("Allow")!.onPress();
    state.confirmations.pop()!();
  });
  const original = state.writes.mock.calls[0][1];
  state.detail = { ...state.detail!, updatedAt: 2 };
  await render();
  expect(state.actions.get("Allow")?.disabled).toBe(true);
  state.detail.pendingInputs = [
    {
      ...state.detail.pendingInputs[1],
      approval: { requestId: 11, occurrenceId: "22222222-2222-4222-8222-222222222222" },
    },
  ];
  await render();
  expect(state.actions.get("Allow")?.disabled).toBe(false);
  await act(async () => {
    state.actions.get("Allow")!.onPress();
    state.confirmations.pop()!();
  });
  const replacement = state.writes.mock.calls[1][1];
  expect(replacement.approvalId).toBe(original.approvalId);
  expect(replacement.approvalOccurrenceId).toBe("22222222-2222-4222-8222-222222222222");
  expect(replacement.requestId).not.toBe(original.requestId);
});

it("separates question and approval owners with the same numeric request and session IDs", async () => {
  state.detail!.pendingInputs = [
    {
      ...state.detail!.pendingInputs[0],
      sessionId: "shared",
      targetRunId: "shared-turn",
      question: { requestId: 11, questions: [] },
    },
  ];
  await render();
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Edit answer")!
      .click(),
  );
  state.detail!.pendingInputs.push({
    ...detail().pendingInputs[1],
    sessionId: "shared",
    targetRunId: "shared-turn",
  });
  await render();
  expect(container.querySelector("textarea")?.value).toBe("Retained response");
  expect(state.actions.get("Allow")?.disabled).toBe(false);
  expect(state.writes).not.toHaveBeenCalled();
});

it("routes unverified legacy approvals to the exact member session without sending a decision", async () => {
  state.detail!.pendingInputs = [
    { ...state.detail!.pendingInputs[1], approval: { requestId: 11 } },
  ];
  await render();
  expect(state.actions.get("Allow")?.disabled).toBe(true);
  expect(state.actions.get("Deny")?.disabled).toBe(true);
  state.actions.get("Open session")!.onPress();
  expect(state.navigate).toHaveBeenCalledWith(
    expect.objectContaining({ params: { id: "approval", machineId: "pc", projectId: "project" } }),
  );
  expect(state.writes).not.toHaveBeenCalled();
});

it("rejects a retained confirmation after a same-machine connection epoch changes", async () => {
  await render();
  state.actions.get("Allow")!.onPress();
  const retained = state.confirmations.pop()!;
  state.epoch = "epoch-b";
  retained();
  expect(state.writes).not.toHaveBeenCalled();
});

it("checks an uncertain owner request without resending and releases only its exact receipt", async () => {
  state.requestFails = true;
  await render();
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Request to crew"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(
      input,
      "Keep this request",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => state.actions.get("Add request")!.onPress());
  expect(state.writes).toHaveBeenCalledTimes(1);
  const sent = state.writes.mock.calls[0]![1] as { requestId: string; text: string };
  expect(sent.text).toBe("Keep this request");
  expect(input.value).toBe("Keep this request");
  expect(state.actions.get("Add request")?.disabled).toBe(true);
  state.detail!.messages = [
    { id: sent.requestId, from: "owner", text: "Different request" },
  ] as CrewRunDetail["messages"];
  await act(async () => state.actions.get("Check request")!.onPress());
  expect(state.actions.get("Add request")?.disabled).toBe(true);
  expect(input.value).toBe("Keep this request");
  state.detail!.messages = [
    { id: sent.requestId, from: "owner", text: sent.text },
  ] as CrewRunDetail["messages"];
  await act(async () => state.actions.get("Check request")!.onPress());
  expect(input.value).toBe("");
  expect(state.reset).toHaveBeenCalledOnce();
  expect(state.writes).toHaveBeenCalledTimes(1);
  expect(state.refetch).toHaveBeenCalledTimes(2);
});
