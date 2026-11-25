// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ToastCardProps } from "../../ui/toast-card";
import { DiagnosticSharingNotice } from "./DiagnosticSharingNotice";
import { buildDiagnosticReport } from "./diagnostic-report";
import { diagnosticSharingGeneration, reviewDiagnosticSharing, setDiagnosticReceiptsShown } from "./diagnostic-sharing";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => undefined },
}));
vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
}));
vi.mock("../account/ui/account-context", () => ({ useAccount: () => ({ status: "signedOut" }) }));
vi.mock("../../ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("../../ui/provider", () => ({
  ActionableToast: ({ message, description, action, secondaryAction }: ToastCardProps) =>
    createElement("aside", null, message, description,
      ...[secondaryAction, action].map((button) => button &&
        createElement("button", { key: button.label, onClick: button.onPress }, button.label))),
}));
vi.mock("../../ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Body: Group, CodePanel: Group, CodeText: Group, Disclosure: Group, Stack: Group,
    Sheet: ({ visible, children, title }: PropsWithChildren<{ visible: boolean; title: string }>) =>
      visible ? createElement("section", { "aria-label": title }, children) : null,
    FormActions: ({ submitLabel, cancelLabel, onSubmit, onCancel }: {
      submitLabel: string; cancelLabel: string; onSubmit: () => void; onCancel: () => void;
    }) => createElement("div", null,
      createElement("button", { onClick: onSubmit }, submitLabel),
      createElement("button", { onClick: onCancel }, cancelLabel)),
  };
});

const report = buildDiagnosticReport({
  trigger: "manual", log: "A test log", crash: null, email: null,
  context: { appVersion: "1.0.0", platform: "ios", osVersion: "27", channel: "stable" },
  now: new Date("2026-11-25T00:00:00Z"),
})!;
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await setDiagnosticReceiptsShown(true);
  container = document.createElement("div");
  root = createRoot(container);
  await act(() => root.render(createElement(DiagnosticSharingNotice)));
});

afterEach(async () => {
  await act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function press(label: string) {
  const button = [...container.querySelectorAll("button")].find((element) => element.textContent === label);
  expect(button, label).toBeDefined();
  await act(() => button!.click());
}

it("pauses automatic sending during review and cancels from the sheet", async () => {
  vi.useFakeTimers();
  const send = vi.fn(async () => "sent" as const);
  let result: ReturnType<typeof reviewDiagnosticSharing>;
  await act(() => {
    result = reviewDiagnosticSharing(report, "https://account.test", false, diagnosticSharingGeneration(), () => "auto", send);
  });
  expect(container.querySelector("aside")?.textContent).toContain("The report will be sent automatically.");
  await press("Review report");
  expect(container.querySelector("aside")).toBeNull();
  expect(container.querySelector("section")?.textContent).toContain("A test log");
  await act(async () => { await vi.advanceTimersByTimeAsync(11_000); });
  expect(send).not.toHaveBeenCalled();
  await press("Cancel sending");
  expect(await result!).toBe("declined");
  expect(container.textContent).toBe("");
});

it("requires approval in ask mode and lets the user close the receipt", async () => {
  const send = vi.fn(async () => "sent" as const);
  let result: ReturnType<typeof reviewDiagnosticSharing>;
  await act(() => {
    result = reviewDiagnosticSharing(report, "https://account.test", false, diagnosticSharingGeneration(), () => "ask", send);
  });
  expect(container.querySelector("aside")?.textContent).toContain("Diagnostic report ready");
  expect(send).not.toHaveBeenCalled();
  await press("Review report");
  await press("Send once");
  expect(await result!).toBe("sent");
  expect(send).toHaveBeenCalledOnce();
  expect(container.querySelector("aside")?.textContent).toContain("Diagnostic report sent");
  await press("Close");
  expect(container.querySelector("aside")).toBeNull();
});
