// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ApprovalView } from "./approvals-model";

const fixture = vi.hoisted(() => ({
  machine: { id: "host-a", name: "Computer A" },
  epoch: "epoch-a",
  decide: vi.fn(),
  refetch: vi.fn(),
}));
const approval: ApprovalView = {
  id: "request-1", title: "Publish review", message: "Review this exact change",
  confirmLabel: "Publish", cancelLabel: "Cancel", deadline: 10_000,
  remote: true, signature: "signed", status: "pending",
};
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => fixture.machine }));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: () => {
  const token = fixture.epoch;
  return { token, isCurrent: () => fixture.epoch === token };
} }));
vi.mock("./approvals-signature", () => ({ approvalSignatureMatches: async () => true }));
vi.mock("./approval-details", () => ({ ApprovalDetails: () => null }));
vi.mock("./use-approvals", () => ({
  useNow: () => 0,
  useApprovals: () => ({
    client: { decide: fixture.decide }, supported: true, approvals: [approval],
    query: { isSuccess: true, refetch: fixture.refetch },
  }),
}));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled, busy }: { label: string; onPress(): void; disabled?: boolean; busy?: boolean }) =>
    createElement("button", { onClick: onPress, disabled: disabled || busy, "aria-busy": busy || undefined }, label);
  return {
    Body: Group, Heading: Group, Card: Group, Row: Group, Screen: Group,
    Badge: ({ label }: { label: string }) => createElement("span", null, label),
    Button, Empty: () => null, QueryState: () => null,
    Notice: ({ message, action }: { message: string; action?: { label: string; onPress(): void } }) =>
      createElement("div", null, message, action ? createElement(Button, action) : null),
    ScreenList: ({ header, data, renderItem }: { header: React.ReactNode; data: ApprovalView[]; renderItem(input: { item: ApprovalView }): React.ReactNode }) =>
      createElement("main", null, header, ...data.map(item => createElement("div", { key: item.id }, renderItem({ item })))),
  };
});
import { ApprovalsScreen } from "./approvals-screen";

let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const button = (label: string) => [...container.querySelectorAll("button")].find(node => node.textContent === label);
const click = (label: string) => act(async () => { const node = button(label); expect(node).toBeDefined(); node!.click(); });
const render = () => act(async () => root.render(createElement(ApprovalsScreen)));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks(); fixture.machine = { id: "host-a", name: "Computer A" }; fixture.epoch = "epoch-a";
  fixture.refetch.mockResolvedValue({ isSuccess: true, isError: false });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("keeps a named busy action visible until the exact decision settles", async () => {
  const response = deferred<unknown>(); fixture.decide.mockReturnValue(response.promise);
  await render(); await click("Publish");
  expect(button("Sending…")?.getAttribute("aria-busy")).toBe("true");
  expect(button("Sending…")?.disabled).toBe(true);
  expect(button("Deny")?.disabled).toBe(true);
  expect(fixture.decide).toHaveBeenCalledExactlyOnceWith(approval, true);
  await act(async () => response.resolve({}));
});

it("retains the unknown-result hold when status refresh resolves with an error", async () => {
  fixture.decide.mockRejectedValue(new Error("Reply lost"));
  await render(); await click("Publish");
  expect(button("Check status")).toBeDefined();
  fixture.refetch.mockResolvedValue({ isSuccess: false, isError: true, error: new Error("Offline") });
  await click("Check status");
  expect(button("Check status")).toBeDefined();
  expect(button("Publish")).toBeUndefined();
  expect(fixture.decide).toHaveBeenCalledTimes(1);
});

it("allows a deliberate answer only after status was successfully refreshed", async () => {
  fixture.decide.mockRejectedValue(new Error("Reply lost"));
  await render(); await click("Publish"); await click("Check status");
  expect(button("Publish")?.disabled).toBe(false);
  expect(fixture.decide).toHaveBeenCalledTimes(1);
});

it("keeps an unknown hold across ordinary renders of the same Host epoch", async () => {
  fixture.decide.mockRejectedValue(new Error("Reply lost"));
  await render(); await click("Publish"); await render();
  expect(button("Check status")).toBeDefined();
  expect(button("Publish")).toBeUndefined();
  expect(fixture.decide).toHaveBeenCalledTimes(1);
});

it("does not apply a previous Host status check after its epoch changes", async () => {
  fixture.decide.mockRejectedValue(new Error("Reply lost"));
  await render(); await click("Publish");
  const check = deferred<{ isSuccess: boolean }>();
  fixture.refetch.mockReturnValue(check.promise);
  await click("Check status");
  fixture.machine = { id: "host-b", name: "Computer B" }; fixture.epoch = "epoch-b";
  await render();
  await act(async () => check.resolve({ isSuccess: true }));
  expect(button("Check status")).toBeUndefined();
  expect(button("Publish")?.disabled).toBe(false);
  expect(fixture.decide).toHaveBeenCalledTimes(1);
});

it("isolates pending local feedback across Host epochs even for the same request ID", async () => {
  const response = deferred<unknown>(); fixture.decide.mockReturnValue(response.promise);
  await render(); await click("Publish");
  fixture.machine = { id: "host-b", name: "Computer B" }; fixture.epoch = "epoch-b";
  await render();
  expect(button("Publish")?.disabled).toBe(false);
  await act(async () => response.reject(new Error("Old Host reply lost")));
  expect(button("Check status")).toBeUndefined();
  expect(button("Publish")?.disabled).toBe(false);
  expect(fixture.refetch).not.toHaveBeenCalled();
});
