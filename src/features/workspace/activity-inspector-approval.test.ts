// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RemoteHostError } from "@/remote/host-error";

const session = vi.hoisted(() => ({ updatedAt: 1, refetch: vi.fn<() => Promise<void>>() }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({
  getQueryState: () => ({ dataUpdatedAt: session.updatedAt }),
  refetchQueries: session.refetch,
}) }));
vi.mock("@/state/queries", () => ({ hostKey: (machineId: string, key: unknown[]) => [machineId, ...key] }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Wrap, Row: Wrap, Badge: ({ label }: { label: string }) => createElement("span", null, label), StatusText: ({ label }: { label: string }) => createElement("span", null, label),
    ErrorText: ({ error }: { error: unknown }) => error ? createElement("p", null, String(error)) : null,
    Button: ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress(): void }) => createElement("button", { disabled, onClick: onPress }, label) };
});
import { ActivityApproval } from "./activity-inspector-approval";
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
let props: Parameters<typeof ActivityApproval>[0];
let sequence = 0;
const render = () => act(async () => root.render(createElement(ActivityApproval, props)));
const button = (label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === label)!;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  props = { approval: { requestId: 7, occurrenceId: `occurrence-${++sequence}` }, scope: { machineId: "machine", sessionId: "session" }, runId: "run", disabled: false, onCommand: vi.fn().mockResolvedValue({}) };
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

it("captures exact occurrence once and keeps receipt acceptance distinct from provider approval", async () => {
  await render();
  await act(async () => { button("Allow").click(); button("Deny").click(); });
  expect(props.onCommand).toHaveBeenCalledExactlyOnceWith({ type: "approve", sessionId: "session", runId: "run", requestId: 7, approvalOccurrenceId: props.approval.occurrenceId, decision: "allow" });
  expect(container.textContent).toContain("Decision sent · waiting for confirmation");
  expect(container.textContent).not.toContain("Allowed");
  expect(button("Deny").disabled).toBe(true);
  props = { ...props, approval: { ...props.approval, decided: "allow" } }; await render();
  expect(container.textContent).toBe("Allowed");
});

it("holds uncertain results across navigation and separates a replacement occurrence", async () => {
  props.onCommand = vi.fn().mockRejectedValue(new Error("Connection lost"));
  await render(); await act(async () => button("Deny").click());
  await act(async () => root.unmount()); root = createRoot(container); await render();
  expect(button("Allow").disabled).toBe(true);
  expect(container.textContent).toContain("Approval delivery not confirmed");
  expect(props.onCommand).toHaveBeenCalledTimes(1);
  props = { ...props, approval: { ...props.approval, occurrenceId: "replacement" } }; await render();
  expect(button("Allow").disabled).toBe(false);
});

it("releases an uncertain answer only after a newer session read, and never resends it", async () => {
  props.onCommand = vi.fn().mockRejectedValue(new Error("Connection lost"));
  await render(); await act(async () => button("Allow").click());
  session.refetch.mockImplementation(async () => {});
  await act(async () => button("Check status").click());
  expect(button("Allow").disabled).toBe(true);
  session.refetch.mockImplementation(async () => { session.updatedAt += 1; });
  await act(async () => button("Check status").click());
  expect(button("Allow").disabled).toBe(false);
  expect(button("Check status")).toBeUndefined();
  expect(props.onCommand).toHaveBeenCalledTimes(1);
});

it("keeps the hold and shows the failure when the status read fails", async () => {
  props.onCommand = vi.fn().mockRejectedValue(new Error("Connection lost"));
  await render(); await act(async () => button("Deny").click());
  session.refetch.mockRejectedValue(new Error("Still offline"));
  await act(async () => button("Check status").click());
  expect(button("Allow").disabled).toBe(true);
  expect(container.textContent).toContain("Still offline");
});

it("keeps known rejection actionable and respects external permission and missing run guards", async () => {
  props.onCommand = vi.fn().mockRejectedValue(new RemoteHostError("machine", "host", "Request no longer active", false));
  await render(); await act(async () => button("Allow").click());
  expect(button("Allow").disabled).toBe(false);
  expect(container.textContent).toContain("Request no longer active");
  props = { ...props, disabled: true }; await render(); expect(button("Deny").disabled).toBe(true);
  props = { ...props, disabled: false, runId: undefined }; await render(); expect(button("Deny").disabled).toBe(true);
  expect(container.textContent).toContain("Refresh the session to approve.");
});
