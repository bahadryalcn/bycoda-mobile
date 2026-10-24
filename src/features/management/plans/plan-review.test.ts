// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { Block } from "@/domain/types";
import type { TranscriptBlockProps } from "@/features/workspace/session-types";
import { PlanReview } from "./plan-review";
const state = vi.hoisted(() => ({ activeId: "m", capabilities: ["sessions.plan.review"],
  command: vi.fn(async (_command: unknown): Promise<void> => undefined) }));
vi.mock("@/state/machines", () => ({ useMachines: Object.assign((selector: (s: unknown) => unknown) => selector({ machines: [{ id: "m", capabilities: state.capabilities }] }),
  { getState: () => ({ activeId: state.activeId }) }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: ({ onClose }: { onClose: () => void }) => ({ requestClose: onClose }) }));
vi.mock("@/features/workspace/shared", () => ({ ErrorText: ({ error }: { error: unknown }) => createElement("p", null, error ? String(error) : "") }));
vi.mock("@/ui/primitives", () => ({
  Stack: ({ children }: PropsWithChildren) => createElement("div", null, children),
  Body: ({ children }: PropsWithChildren) => createElement("p", null, children),
  Notice: ({ message }: { message: string }) => createElement("p", null, message),
  Field: ({ value, onChangeText, editable }: { value: string; onChangeText: (text: string) => void; editable: boolean }) =>
    createElement("textarea", { value, disabled: !editable, onChange: (event) => onChangeText((event.currentTarget as HTMLTextAreaElement).value) }),
  FormActions: ({ onSubmit, disabled, busy, feedback }: { onSubmit: () => void; disabled: boolean; busy: boolean; feedback: unknown }) =>
    createElement("div", null, createElement("button", { onClick: onSubmit, disabled: disabled || busy }, "Build"), feedback as never),
}));
let root: ReturnType<typeof createRoot>;
const container = document.createElement("div");
const block = { id: "p", role: "plan", text: "# Plan\n1. Review", plan: { status: "ready" } } as Block;
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  await act(async () => root.render(createElement(PlanReview, { block,
    scope: { machineId: "m", sessionId: "s" }, disabled: false,
    onCommand: state.command as unknown as TranscriptBlockProps["onCommand"], onClose: vi.fn() })));
}
afterEach(async () => { await act(async () => root?.unmount()); vi.clearAllMocks(); state.activeId = "m"; state.capabilities = ["sessions.plan.review"]; vi.unstubAllGlobals(); });
it("opening a plan never executes it and explicit build pins the base", async () => {
  await mount();
  expect(state.command).not.toHaveBeenCalled();
  await act(async () => container.querySelector("button")!.click());
  expect(state.command).toHaveBeenCalledExactlyOnceWith({ type: "send", sessionId: "s", intent: "build", planBlockId: "p", text: block.text, expectedPlanText: block.text });
});
it("does not replay after an uncertain build or retarget after a machine change", async () => {
  state.command.mockRejectedValueOnce(new Error("Connection lost"));
  await mount();
  state.activeId = "other";
  await act(async () => container.querySelector("button")!.click());
  expect(state.command).not.toHaveBeenCalled();
  state.activeId = "m";
  await act(async () => container.querySelector("button")!.click());
  expect(state.command).toHaveBeenCalledTimes(1);
  expect(container.querySelector("button")!.disabled).toBe(true);
  await act(async () => container.querySelector("button")!.click());
  expect(state.command).toHaveBeenCalledTimes(1);
});
