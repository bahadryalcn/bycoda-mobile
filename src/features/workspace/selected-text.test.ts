// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SelectedText } from "./selected-text";
const state = vi.hoisted(() => ({ transfer: vi.fn() }));
vi.mock("react-native", () => ({ useWindowDimensions: () => ({ height: 844 }) }));
vi.mock("@/i18n", () => ({ useLocale: () => "tr" }));
vi.mock("@/localization", () => ({ LANGUAGES: [{ value: "tr", label: "Türkçe" }, { value: "en", label: "English" }] }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./composer-transfer", () => ({ useComposerTransfer: () => ({ transfer: state.transfer }) }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Wrapper, Row: Wrapper, Sheet: ({ children, footer }: PropsWithChildren<{ footer?: import("react").ReactNode }>) => createElement("div", null, children, footer), ErrorText: () => null, Notice: () => null, SelectField: () => null,
    Field: ({ value, readOnly, onSelectionChange }: { value: string; readOnly: boolean; onSelectionChange: (event: { nativeEvent: { selection: { start: number; end: number } } }) => void }) => createElement("textarea", { value, readOnly, onSelect: (event: import("react").SyntheticEvent<HTMLTextAreaElement>) => onSelectionChange({ nativeEvent: { selection: { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd } } }) }),
    Button: ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label),
  };
});
let root: ReturnType<typeof createRoot> | undefined; let container: HTMLDivElement;
async function render(text = "before EXACT after") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); }
  await act(async () => root!.render(createElement(SelectedText, { text, scope: { machineId: "machine", sessionId: "session" }, onClose: vi.fn() })));
}
async function select(start: number, end: number) {
  const input = container.querySelector("textarea")!;
  await act(async () => { input.focus(); input.setSelectionRange(start, end); input.dispatchEvent(new Event("select", { bubbles: true })); });
}
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; container?.remove(); state.transfer.mockReset(); vi.unstubAllGlobals(); });
it("requires native selection on readonly source and transfers only the exact quote", async () => {
  await render(); expect(container.querySelector("textarea")!.readOnly).toBe(true);
  await click("Add quote to draft"); expect(state.transfer).not.toHaveBeenCalled();
  await select(7, 12); await click("Add quote to draft");
  expect(state.transfer).toHaveBeenCalledExactlyOnceWith({ machineId: "machine", sessionId: "session", text: "> EXACT" });
});
it("prepares a language-specific translation draft without sending or including unselected text", async () => {
  await render(); await select(7, 12); await click("Prepare translation draft");
  const request = state.transfer.mock.calls[0][0]; expect(request.text).toContain("Türkçe"); expect(request.text).toContain("> EXACT"); expect(request.text).not.toContain("before");
});
it("clears selection when paging instead of applying old offsets to another page", async () => {
  await render("x".repeat(12000) + "second page"); await select(0, 3); await click("Next"); await click("Add quote to draft");
  expect(state.transfer).not.toHaveBeenCalled();
});
