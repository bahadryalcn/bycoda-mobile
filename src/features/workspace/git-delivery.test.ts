// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RemoteHostError } from "@/remote/host-error";
import { GitDeliverySheet } from "./git-delivery";

const state = vi.hoisted(() => ({
  current: true,
  workspaces: [
    { id: "other", owner: { kind: "task", id: "other" }, branchRef: "refs/heads/work", targetBranchRef: "refs/heads/main", revision: 1 },
    { id: "owned", owner: { kind: "task", id: "task" }, branchRef: "refs/heads/work", targetBranchRef: "refs/heads/main", revision: 2 },
  ],
  review: vi.fn(), merge: vi.fn(), refetch: vi.fn(), randomUUID: vi.fn(), refreshProject: vi.fn(),
}));
vi.mock("expo-crypto", () => ({ randomUUID: state.randomUUID }));
vi.mock("./shared", () => ({ useProjectRefresh: () => state.refreshProject }));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: () => ({ isCurrent: () => state.current }) }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "pc", name: "Harbor computer" }) }));
vi.mock("@/state/queries", () => ({
  useHostQuery: () => ({ data: state.workspaces, refetch: state.refetch }),
  useHostMutation: (method: string) => ({ reset() {}, mutateAsync: method.endsWith(".review") ? state.review : state.merge }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ uiStyles: {} }) }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) =>
    createElement("button", { onClick: onPress, disabled }, label);
  return {
    Body: Group, Disclosure: Group, Sheet: Group, Button, ErrorNotice: Group, QueryState: Group, MutationState: Group,
    Notice: ({ message }: { message: string }) => createElement("div", null, message),
    ConfirmationCard: ({ children, message, confirmLabel, cancelLabel, onConfirm, onCancel, disabled }: PropsWithChildren<{
      message: string;
      confirmLabel: string; cancelLabel: string; onConfirm: () => void; onCancel: () => void; disabled?: boolean;
    }>) => createElement("div", null, message, children, createElement(Button, { label: confirmLabel, onPress: onConfirm, disabled }),
      createElement(Button, { label: cancelLabel, onPress: onCancel })),
  };
});

const plan = (token: string) => ({
  action: "merge", workspaceId: "owned", expectedRevision: 2, token, expiresAt: Date.now() + 60_000, expiresInMs: 60_000,
  sourceBranchRef: "refs/heads/work", sourceHead: "a".repeat(40), targetBranchRef: "refs/heads/main", targetHead: "b".repeat(40),
  targetStatusFingerprint: "fingerprint", commits: [], changedPaths: ["review.txt"], overlappingPaths: [], checks: [], visualEvidence: [], blockers: [],
});
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
const button = (label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === label);
const click = (label: string) => act(async () => button(label)!.click());
const render = () => act(async () => root.render(createElement(GitDeliverySheet, {
  scope: { projectId: "harbor" }, branch: "work", task: { id: "task", title: "Harbor review" }, onClose: vi.fn(),
})));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.current = true;
  root = createRoot(container);
  state.refetch.mockResolvedValue({ data: state.workspaces });
  state.randomUUID.mockReturnValueOnce("first-key").mockReturnValueOnce("second-key");
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it("reconciles an unconfirmed review explicitly and submits only the approved token for the task's workspace", async () => {
  state.review.mockResolvedValueOnce(plan("first")).mockResolvedValueOnce(plan("second"));
  state.merge.mockRejectedValueOnce(new RemoteHostError("pc", "host", "Unconfirmed", true)).mockResolvedValue({});
  await render();
  await click("Review delivery");
  expect(state.review).toHaveBeenCalledExactlyOnceWith({ workspaceId: "owned", expectedRevision: 2, action: "merge" });
  expect(state.merge).not.toHaveBeenCalled();
  await click("Approve delivery");
  expect(button("Retry")).toBeDefined();
  await click("Check status");
  expect(state.refetch).toHaveBeenCalledOnce();
  expect(state.merge).toHaveBeenCalledOnce();
  await click("Approve delivery");
  expect(state.merge.mock.calls).toEqual([
    [{ workspaceId: "owned", expectedRevision: 2, idempotencyKey: "first-key", planToken: "first" }],
    [{ workspaceId: "owned", expectedRevision: 2, idempotencyKey: "second-key", planToken: "second" }],
  ]);
  expect(container.textContent).toContain("Delivered.");
  expect(button("Approve delivery")).toBeUndefined();
  expect(button("Done")).toBeDefined();
  expect(state.refreshProject).toHaveBeenCalledOnce();
});

it("confirms a recorded merge from the exact workspace without sending another approval", async () => {
  state.review.mockResolvedValue(plan("first"));
  state.merge.mockRejectedValueOnce(new RemoteHostError("pc", "network", "Connection lost", true));
  state.refetch.mockResolvedValueOnce({ data: [state.workspaces[0], {
    ...state.workspaces[1], state: "merged", revision: 3, deliveredCommit: "c".repeat(40),
  }] });
  await render();
  await click("Review delivery");
  await click("Approve delivery");
  expect(container.textContent).toContain("The action may have been applied.");
  expect(container.textContent).not.toContain("will be merged");
  await click("Check status");
  expect(state.refetch).toHaveBeenCalledOnce();
  expect(state.merge).toHaveBeenCalledOnce();
  expect(state.review).toHaveBeenCalledOnce();
  expect(container.textContent).toContain("Delivered.");
  expect(button("Retry")).toBeUndefined();
  expect(state.refreshProject).toHaveBeenCalledOnce();
});

it("retires the merge action when its connection has changed", async () => {
  state.review.mockResolvedValue(plan("first"));
  await render();
  await click("Review delivery");
  state.current = false;
  await click("Approve delivery");
  expect(state.merge).not.toHaveBeenCalled();
});
