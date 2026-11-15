// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("expo-router", () => ({ router: { navigate: vi.fn() } }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./feedback", () => ({
  ErrorNotice: ({ error }: { error?: Error }) => createElement("p", null, error?.message),
  Loading: ({ label }: { label: string }) => createElement("p", null, label),
  Empty: () => null, Notice: ({ message }: { message: string }) => createElement("p", null, message), Skeleton: () => null,
}));
vi.mock("./state-view", () => ({ StateView: () => null }));
vi.mock("./typography", () => ({ Body: ({ children }: PropsWithChildren) => createElement("p", null, children) }));
const toast = vi.hoisted(() => ({ available: false, show: vi.fn() }));
vi.mock("./toast", () => ({ showToast: toast.show, useToastAvailable: () => toast.available }));
import { MutationState } from "./query-state";
let root: ReturnType<typeof createRoot>, node: HTMLDivElement;
type State = { isPending?: boolean; isSuccess?: boolean; isError?: boolean; error?: Error; submittedAt?: number };
const render = async (mutation: State, success = "Saved.") => act(() => root.render(createElement(MutationState, { mutation, success, pending: "Working…" })));
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); node = document.createElement("div"); document.body.append(node); root = createRoot(node); });
afterEach(() => { act(() => root.unmount()); node.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("translates active acknowledgement without extending its lifetime or replaying it after expiry", async () => {
  const mutation = { isSuccess: true, submittedAt: 100 };
  await render(mutation); expect(node.textContent).toBe("Saved.");
  await act(() => vi.advanceTimersByTime(2000)); await render(mutation, "Kaydedildi.");
  expect(node.textContent).toBe("Kaydedildi.");
  await act(() => vi.advanceTimersByTime(3001)); expect(node.textContent).toBe("");
  await render(mutation, "Enregistré."); expect(node.textContent).toBe("");
});
it("acknowledges a new submitted operation even when an intermediate pending render was batched away", async () => {
  await render({ isSuccess: true, submittedAt: 100 });
  await act(() => vi.advanceTimersByTime(5001)); expect(node.textContent).toBe("");
  await render({ isSuccess: true, submittedAt: 200 }); expect(node.textContent).toBe("Saved.");
  await act(() => vi.advanceTimersByTime(4999)); expect(node.textContent).toBe("Saved.");
  await act(() => vi.advanceTimersByTime(1)); expect(node.textContent).toBe("");
});
it("keeps pending/error priority and persistent uncertain feedback before another successful operation", async () => {
  await render({ isSuccess: true, submittedAt: 100 });
  await render({ isPending: true, submittedAt: 200 }); expect(node.textContent).toBe("Working…");
  await render({ isError: true, error: new Error("Outcome unknown"), submittedAt: 200 });
  await act(() => vi.advanceTimersByTime(10000)); expect(node.textContent).toBe("Outcome unknown");
  await render({ isSuccess: true, submittedAt: 300 }); expect(node.textContent).toBe("Saved.");
});
it("leaves pending progress to a busy action control instead of drawing a second indicator", async () => {
  const { FormActionBusy } = await import("./form-action-context");
  const renderInBusyAction = (mutation: State) => act(() => root.render(createElement(
    FormActionBusy, { value: true }, createElement(MutationState, { mutation, pending: "Working…" }),
  )));
  await renderInBusyAction({ isPending: true, submittedAt: 1 });
  expect(node.textContent).toBe("");
  await renderInBusyAction({ isError: true, error: new Error("Unreachable"), submittedAt: 1 });
  expect(node.textContent).toBe("Unreachable");
});
it("raises one success toast per submission instead of inline text when a toast host is mounted", async () => {
  toast.available = true; toast.show.mockClear();
  await render({ isSuccess: true, submittedAt: 100 }); expect(node.textContent).toBe("");
  await render({ isSuccess: true, submittedAt: 100 }, "Kaydedildi.");
  expect(toast.show).toHaveBeenCalledExactlyOnceWith({ tone: "success", message: "Saved." });
  await render({ isSuccess: true, submittedAt: 200 }); expect(toast.show).toHaveBeenCalledTimes(2);
  toast.available = false;
});
