// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SelectedText } from "./selected-text";
const state = vi.hoisted(() => ({ transfer: vi.fn(), toast: vi.fn(), clipboard: vi.fn(), ask: vi.fn(), selections: [] as ((event:{nativeEvent:{selection:{start:number;end:number}}})=>void)[], buttons: [] as {label:string;press:()=>void}[] }));
const security=vi.hoisted(()=>({allowed:true,listeners:new Set<()=>void>()}));
vi.mock("@/state/security",()=>({isAppAccessAllowed:()=>security.allowed,useSecurity:{getState:()=>({appState:"active",windowFocused:true}),subscribe:(fn:()=>void)=>{security.listeners.add(fn);return()=>security.listeners.delete(fn);}}}));
vi.mock("react-native", () => ({ useWindowDimensions: () => ({ height: 844 }), View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("expo-clipboard", () => ({ setStringAsync: state.clipboard }));
vi.mock("@/ui/message-selection", () => ({ SelectableMessage: ({ children }: PropsWithChildren) => children }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: { border: "#ccc" } }) }));
vi.mock("@/ui/tokens", () => ({ space: { xs: 4, md: 12 } }));
vi.mock("@/ui/error-message", () => ({ errorMessage: (error: unknown) => String(error) }));
vi.mock("@/features/side-chat/side-chat-client", () => ({ askSideQuestion: state.ask }));
vi.mock("@/ui/action-group", () => ({ ActionGroup: ({ actions }: { actions: { label: string; disabled?: boolean; onPress: () => void }[] }) =>
  createElement("div", null, ...actions.map((action) => { state.buttons.push({ label: action.label, press: action.onPress }); return createElement("button", { key: action.label, disabled: action.disabled, onClick: action.onPress }, action.label); })) }));
vi.mock("@/i18n", () => ({ useLocale: () => "tr" }));
vi.mock("@/localization", () => ({ LANGUAGES: [{ value: "tr", label: "Türkçe" }, { value: "en", label: "English" }] }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./composer-transfer", () => ({ useComposerTransfer: () => ({ transfer: state.transfer }) }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { showToast: state.toast, Body: Wrapper, Row: Wrapper, Sheet: ({ children, footer }: PropsWithChildren<{ footer?: import("react").ReactNode }>) => createElement("div", null, children, footer), ErrorText: () => null, Notice: () => null, SelectField: () => null,
    Field: ({ value, readOnly, onSelectionChange }: { value: string; readOnly: boolean; onSelectionChange: (event: { nativeEvent: { selection: { start: number; end: number } } }) => void }) => {state.selections.push(onSelectionChange);return createElement("textarea", { value, readOnly, onSelect: (event: import("react").SyntheticEvent<HTMLTextAreaElement>) => onSelectionChange({ nativeEvent: { selection: { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd } } }) });},
    Button: ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => {state.buttons.push({label,press:onPress});return createElement("button", { disabled, onClick: onPress }, label);},
  };
});
let root: ReturnType<typeof createRoot> | undefined; let container: HTMLDivElement;
async function render(text = "before EXACT after", extra: Record<string, unknown> = { role: "user" }) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) { container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container); }
  await act(async () => root!.render(createElement(SelectedText, { text, scope: { machineId: "machine", sessionId: "session" }, onClose: vi.fn(), ...extra })));
}
async function select(start: number, end: number) {
  const input = container.querySelector("textarea")!;
  await act(async () => { input.focus(); input.setSelectionRange(start, end); input.dispatchEvent(new Event("select", { bubbles: true })); });
}
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; container?.remove(); state.transfer.mockReset(); state.toast.mockReset(); state.clipboard.mockReset(); state.ask.mockReset(); vi.unstubAllGlobals(); });
it("requires native selection on readonly source and transfers only the exact quote", async () => {
  await render(); expect(container.querySelector("textarea")!.readOnly).toBe(true);
  await click("Quote"); expect(state.transfer).not.toHaveBeenCalled();
  await select(7, 12); await click("Quote");
  expect(state.transfer).toHaveBeenCalledExactlyOnceWith({ machineId: "machine", sessionId: "session", text: "> EXACT" });
});
it("prepares a language-specific translation draft without sending or including unselected text", async () => {
  await render(); await select(7, 12); await click("Translate"); await click("Add translation request to draft");
  const request = state.transfer.mock.calls[0][0]; expect(request.text).toContain("Türkçe"); expect(request.text).toContain("> EXACT"); expect(request.text).not.toContain("before");
});
it("clears selection when paging instead of applying old offsets to another page", async () => {
  await render("x".repeat(12000) + "second page"); await select(0, 3); await click("Next"); await click("Quote");
  expect(state.transfer).not.toHaveBeenCalled();
});

it("rejects a retained quote callback after the selection view unmounts",async()=>{
 await render();await select(7,12);const old=state.buttons.filter(button=>button.label==="Quote").at(-1)!.press;await act(async()=>root!.unmount());root=undefined;await act(async()=>old());expect(state.transfer).not.toHaveBeenCalled();
});
it("does not revive a selection after its source changes and returns",async()=>{
 await render();await select(7,12);await render("different source");await render();await click("Quote");expect(state.transfer).not.toHaveBeenCalled();
});

beforeEach(()=>{security.allowed=true;state.buttons=[];state.selections=[];});
it("does not transfer an old page or selection through a retained callback",async()=>{
 await render("before EXACT after"+"x".repeat(12000));await select(7,12);const old=state.buttons.filter(button=>button.label==="Quote").at(-1)!.press;await click("Next");await act(async()=>old());expect(state.transfer).not.toHaveBeenCalled();
});
it("retires draft insertion on a transient lock/return without sending",async()=>{
 await render();await select(7,12);const old=state.buttons.filter(button=>button.label==="Quote").at(-1)!.press;await act(async()=>{security.allowed=false;security.listeners.forEach(fn=>fn());security.allowed=true;security.listeners.forEach(fn=>fn());old();});await click("Quote");expect(state.transfer).not.toHaveBeenCalled();
});

it("quotes the exact visible selection after CRLF line endings",async()=>{
 await render("before\r\nEXACT after");const visible=container.querySelector("textarea")!.value,start=visible.indexOf("EXACT");await select(start,start+5);await click("Quote");expect(state.transfer).toHaveBeenCalledWith({machineId:"machine",sessionId:"session",text:"> EXACT"});
});

it("ignores a selection event from a retired page even after returning to the same page",async()=>{
 await render("before EXACT after"+"x".repeat(12000));const old=state.selections.at(-1)!;await click("Next");await click("Back");await act(async()=>old({nativeEvent:{selection:{start:7,end:12}}}));await click("Quote");expect(state.transfer).not.toHaveBeenCalled();await select(7,12);await click("Quote");expect(state.transfer).toHaveBeenCalledWith({machineId:"machine",sessionId:"session",text:"> EXACT"});
});
it("ignores retained page navigation after another page becomes current",async()=>{
 await render("x".repeat(24000)+"third page");const next=state.buttons.find(button=>button.label==="Next")!.press;await click("Next");await click("Next");await act(async()=>next());expect(container.querySelector("textarea")!.value).toBe("third page");
});

it("adds the exact selection as plain text and confirms with a toast", async () => {
  await render(); await select(7, 12); await click("Add");
  expect(state.transfer).toHaveBeenCalledExactlyOnceWith({ machineId: "machine", sessionId: "session", text: "EXACT" });
  expect(state.toast).toHaveBeenCalledWith({ message: "Added to message" });
});
it("copies only the selected range", async () => {
  state.clipboard.mockResolvedValue(undefined);
  await render(); await select(7, 12); await click("Copy");
  expect(state.clipboard).toHaveBeenCalledExactlyOnceWith("EXACT"); expect(state.transfer).not.toHaveBeenCalled();
  expect(state.toast).toHaveBeenCalledWith({ message: "Copied" });
});
it("quotes an agent reply with the optional comment, like desktop's citation popover", async () => {
  await render("before EXACT after", { role: "assistant", initial: { kind: "quote", text: "EXACT" } });
  await click("Add to message");
  expect(state.transfer).toHaveBeenCalledExactlyOnceWith({ machineId: "machine", sessionId: "session", text: "> EXACT" });
});
it("translates through an isolated side question and never touches the draft until asked", async () => {
  state.ask.mockResolvedValue("TAM");
  const client = { request: vi.fn(), assertCurrentAccess: vi.fn() };
  await render("before EXACT after", { role: "assistant", client, initial: { kind: "translate", text: "EXACT" } });
  await click("Translate");
  expect(state.ask).toHaveBeenCalledOnce();
  const [port, input] = state.ask.mock.calls[0];
  expect(port).toBe(client); expect(input.sessionId).toBe("session"); expect(input.history).toEqual([]);
  expect(input.question).toContain("into Türkçe"); expect(input.question).toContain("> EXACT");
  expect(container.textContent).toContain("TAM"); expect(state.transfer).not.toHaveBeenCalled();
  await click("Add to message");
  expect(state.transfer).toHaveBeenCalledExactlyOnceWith({ machineId: "machine", sessionId: "session", text: "TAM" });
});
it("offers the draft request when the Host has no side question", async () => {
  state.ask.mockRejectedValue(Object.assign(new Error("Unsupported host method"), { kind: "unsupported" }));
  await render("before EXACT after", { role: "assistant", client: { request: vi.fn() }, initial: { kind: "translate", text: "EXACT" } });
  await click("Translate"); await click("Add translation request to draft");
  expect(state.transfer.mock.calls[0][0].text).toContain("Translate the following quoted excerpt into Türkçe");
});
