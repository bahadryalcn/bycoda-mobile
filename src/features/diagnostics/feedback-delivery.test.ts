// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ send: vi.fn(), logs: vi.fn(), toast: vi.fn() }));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null }, useLocalSearchParams: () => ({}) }));
vi.mock("@/ui/info-hint", () => ({ HintSection: ({ children }: PropsWithChildren) => createElement("section", null, children) }));
vi.mock("../account/ui/account-context", () => ({ useAccount: () => ({ status: "signedOut" }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./diagnostic-copy", () => ({ useDiagnosticResultText: () => (value: string) => value }));
vi.mock("./diagnostics-runtime", () => ({
  useDiagnosticPrefs: (select: (state: unknown) => unknown) => select({ consent: { mode: "ask" }, hydrate: async () => {}, setMode: async () => {} }),
  clearCrashMarker: vi.fn(), feedbackClient: () => ({ signedIn: false, client: null }), feedbackContext: vi.fn(), sendDiagnostics: fixture.logs,
}));
vi.mock("./feedback-model", async () => ({ ...await vi.importActual<typeof import("./feedback-model")>("./feedback-model"), submitFeedback: fixture.send }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Group, Row: Group, Stack: Group, Section: Group, SegmentedControl: () => null, ChoiceChip: () => null, ToggleField: () => null, SelectRow: () => null,
    Screen: ({ children, footer }: PropsWithChildren<{ footer?: React.ReactNode }>) => createElement("main", null, children, footer),
    Field: ({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) => createElement("input", { "aria-label": label, value, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText(event.target.value) }),
    FormActions: ({ onSubmit }: { onSubmit: () => void }) => createElement("button", { onClick: onSubmit }, "Send"),
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label),
    Notice: ({ message }: { message: string }) => createElement("p", null, message), showToast: fixture.toast,
  };
});
import { FeedbackScreen } from "./FeedbackScreen";
import { DiagnosticsSettings } from "./DiagnosticsSettings";
import { useFeedbackDraft } from "./feedback-store";
import type { FeedbackSubmitResult } from "./feedback-model";
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); useFeedbackDraft.getState().clear(); container = document.createElement("div"); document.body.append(container); root = createRoot(container); vi.clearAllMocks(); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const render = () => act(async () => root.render(createElement(FeedbackScreen)));
const send = () => act(() => container.querySelector("button")!.click());
it("keeps feedback edited during delivery and leaves the editor visible", async () => {
  const response = deferred<FeedbackSubmitResult>(); fixture.send.mockReturnValue(response.promise); useFeedbackDraft.getState().patch({ message: "Original feedback" });
  await render(); await send(); await act(() => useFeedbackDraft.getState().patch({ message: "New feedback while delivery is pending" }));
  await act(async () => response.resolve({ status: "sent", reference: "received" }));
  expect(useFeedbackDraft.getState().draft.message).toBe("New feedback while delivery is pending");
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Message"]')?.value).toBe("New feedback while delivery is pending");
});
it("an old successful request cannot clear a newer draft after screen remount", async () => {
  const response = deferred<FeedbackSubmitResult>(); fixture.send.mockReturnValue(response.promise); useFeedbackDraft.getState().patch({ message: "Original" });
  await render(); await send(); await act(async () => root.unmount()); root = createRoot(container);
  useFeedbackDraft.getState().patch({ message: "New screen draft" }); await render();
  await act(async () => response.resolve({ status: "sent", reference: "old-receipt" }));
  expect(useFeedbackDraft.getState().draft.message).toBe("New screen draft"); expect(fixture.toast).not.toHaveBeenCalled();
});
it("suppresses synchronous duplicate send taps and clears only unchanged sent draft", async () => {
  const response = deferred<FeedbackSubmitResult>(); fixture.send.mockReturnValue(response.promise); useFeedbackDraft.getState().patch({ message: "Send once" }); await render();
  await act(() => { container.querySelector("button")!.click(); container.querySelector("button")!.click(); });
  expect(fixture.send).toHaveBeenCalledOnce(); await act(async () => response.resolve({ status: "sent", reference: "receipt" })); expect(useFeedbackDraft.getState().draft.message).toBe("");
});
it("keeps diagnostic note edited during upload", async () => {
  const response = deferred<"sent">(); fixture.logs.mockReturnValue(response.promise); await act(async () => root.render(createElement(DiagnosticsSettings)));
  const input = container.querySelector("input")!;
  const edit = (value: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await edit("Original note"); await act(() => container.querySelector("button")!.click()); await edit("More recent note");
  await act(async () => response.resolve("sent")); expect(input.value).toBe("More recent note");
});
