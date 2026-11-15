// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SessionProjectMismatch } from "@/remote/session-project";
const state = vi.hoisted(() => ({ replace: vi.fn(), same: vi.fn(), current: true, allowed: true }));
vi.mock("expo-router", () => ({ router: { replace: state.replace } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/remote/session-project", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sameSessionProjectFolder: state.same,
}));
const client = {
  machine: { id: "machine" },
  assertCurrentAccess() {
    if (!state.current) throw Error("Source changed");
  },
};
vi.mock("@/state/queries", () => ({ useHostClient: () => client }));
vi.mock("@/ui/primitives", () => ({
  Loading: () => createElement("div", null, "Loading"),
  Empty: ({
    title,
    action,
  }: PropsWithChildren<{ title: string; action?: { label: string; onPress(): void } }>) =>
    createElement(
      "div",
      null,
      title,
      action ? createElement("button", { onClick: action.onPress }, action.label) : null,
    ),
}));
import { SessionProjectRecovery } from "./session-project-recovery";
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  state.replace.mockReset();
  state.same.mockReset();
  state.current = true;
  state.allowed = true;
  vi.unstubAllGlobals();
});
async function render(targetTurnId?: string) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  root = createRoot(node);
  await act(async () =>
    root!.render(
      createElement(SessionProjectRecovery, {
        error: new SessionProjectMismatch("session", "legacy", "canonical"),
        machineId: "machine",
        visible: () => state.allowed,
        targetTurnId,
      }),
    ),
  );
  return node;
}
it("automatically repairs only a proven alias and preserves the session and machine", async () => {
  state.same.mockResolvedValue(true);
  await render();
  expect(state.replace).toHaveBeenCalledWith({
    pathname: "/session/[id]",
    params: { id: "session", projectId: "canonical", machineId: "machine" },
  });
});
it("preserves the exact cited turn when repairing its project route", async () => {
  state.same.mockResolvedValue(true);
  await render("cited-turn");
  expect(state.replace).toHaveBeenCalledWith({
    pathname: "/session/[id]",
    params: {
      id: "session",
      projectId: "canonical",
      machineId: "machine",
      targetTurnId: "cited-turn",
    },
  });
});
it("requires an explicit owner choice for a different visible project", async () => {
  state.same.mockResolvedValue(false);
  const node = await render();
  expect(state.replace).not.toHaveBeenCalled();
  await act(async () => node.querySelector("button")!.click());
  expect(state.replace).toHaveBeenCalledTimes(1);
});
it("never routes after original-source or project access is lost during proof", async () => {
  state.same.mockImplementation(async () => {
    state.current = false;
    state.allowed = false;
    return true;
  });
  await render();
  expect(state.replace).not.toHaveBeenCalled();
});
it("rejects late alias callbacks after unmount", async () => {
  let finish!: (value: boolean) => void;
  state.same.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  await act(async () => root!.unmount());
  root = undefined;
  await act(async () => finish(true));
  expect(state.replace).not.toHaveBeenCalled();
});
