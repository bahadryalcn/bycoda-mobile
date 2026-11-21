// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FeedbackScreen } from "./FeedbackScreen";
import { useFeedbackDraft } from "./feedback-store";

const fixture = vi.hoisted(() => ({
  back: vi.fn(),
  replace: vi.fn(),
  toast: vi.fn(),
  send: vi.fn(),
  hydrate: vi.fn(),
}));
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => true, back: fixture.back, replace: fixture.replace },
}));
vi.mock("../account/ui/account-context", () => ({ useAccount: () => ({}) }));
vi.mock("./diagnostic-copy", () => ({ useDiagnosticResultText: () => () => "" }));
vi.mock("./diagnostics-runtime", () => ({
  useDiagnosticPrefs: (select: (store: unknown) => unknown) => select({ consent: { mode: "ask" }, hydrate: fixture.hydrate }),
  feedbackClient: () => ({ client: { sendFeedback: fixture.send }, signedIn: true }),
  feedbackContext: vi.fn(),
  clearCrashMarker: vi.fn(),
  sendDiagnostics: vi.fn(),
}));
vi.mock("../../ui/copy", () => ({
  useCopy: () => (_tr: string, en: string, values?: { p0: string }) => en.replace("{p0}", values?.p0 ?? "{p0}"),
}));
vi.mock("../../ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Body: Group, Row: Group, Stack: Group,
    ChoiceChip: () => null, SegmentedControl: () => null, ToggleField: () => null,
    showToast: fixture.toast,
    Field: ({ value }: { value: string }) => createElement("textarea", { value, readOnly: true }),
    StateView: ({ title, description }: { title: string; description: string }) =>
      createElement("div", null, createElement("h2", null, title), description),
    Notice: ({ message }: { message: string }) => createElement("p", null, message),
    Screen: ({ children, footer }: PropsWithChildren<{ footer: React.ReactNode }>) =>
      createElement("main", null, children, createElement("footer", null, footer)),
    FormActions: ({ submitLabel, onSubmit, disabled, feedback }: {
      submitLabel: string; onSubmit: () => void; disabled?: boolean; feedback?: React.ReactNode;
    }) => createElement("div", null, feedback, createElement("button", { disabled, onClick: onSubmit }, submitLabel)),
  };
});

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const button = (label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === label);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  useFeedbackDraft.getState().clear();
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it("retains feedback after a failure and shows a single receipt with a working Done action", async () => {
  fixture.send.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({ id: "local-reference" });
  useFeedbackDraft.getState().patch({ message: "Synthetic draft" });
  await act(async () => root.render(createElement(FeedbackScreen)));
  await act(async () => {
    const send = button("Send")!;
    send.click();
    send.click();
  });
  expect(fixture.send).toHaveBeenCalledOnce();
  expect(container.querySelector("textarea")?.value).toBe("Synthetic draft");
  expect(container.querySelector("footer")?.textContent).toContain("Your message is kept.");
  await act(async () => button("Retry")!.click());
  expect(container.textContent).toContain("Reference: local-reference");
  expect(container.querySelector("textarea")).toBeNull();
  expect(fixture.toast).not.toHaveBeenCalled();
  await act(async () => button("Done")!.click());
  expect(fixture.back).toHaveBeenCalledOnce();
});
