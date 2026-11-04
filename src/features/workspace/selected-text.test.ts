// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SelectedText } from "./selected-text";
const state = vi.hoisted(() => ({ transfer: vi.fn(), selections: [] as ((event:{nativeEvent:{selection:{start:number;end:number}}})=>void)[], buttons: [] as {label:string;press:()=>void}[] }));
const security=vi.hoisted(()=>({allowed:true,listeners:new Set<()=>void>()}));
vi.mock("@/state/security",()=>({isAppAccessAllowed:()=>security.allowed,useSecurity:{getState:()=>({appState:"active",windowFocused:true}),subscribe:(fn:()=>void)=>{security.listeners.add(fn);return()=>security.listeners.delete(fn);}}}));
vi.mock("react-native", () => ({ useWindowDimensions: () => ({ height: 844 }) }));
vi.mock("@/i18n", () => ({ useLocale: () => "tr" }));
vi.mock("@/localization", () => ({ LANGUAGES: [{ value: "tr", label: "Türkçe" }, { value: "en", label: "English" }] }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./composer-transfer", () => ({ useComposerTransfer: () => ({ transfer: state.transfer }) }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Wrapper, Row: Wrapper, Sheet: ({ children, footer }: PropsWithChildren<{ footer?: import("react").ReactNode }>) => createElement("div", null, children, footer), ErrorText: () => null, Notice: () => null, SelectField: () => null,
    Field: ({ value, readOnly, onSelectionChange }: { value: string; readOnly: boolean; onSelectionChange: (event: { nativeEvent: { selection: { start: number; end: number } } }) => void }) => {state.selections.push(onSelectionChange);return createElement("textarea", { value, readOnly, onSelect: (event: import("react").SyntheticEvent<HTMLTextAreaElement>) => onSelectionChange({ nativeEvent: { selection: { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd } } }) });},
    Button: ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => {state.buttons.push({label,press:onPress});return createElement("button", { disabled, onClick: onPress }, label);},
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

it("rejects a retained quote callback after the selection view unmounts",async()=>{
 await render();await select(7,12);const old=state.buttons.filter(button=>button.label==="Add quote to draft").at(-1)!.press;await act(async()=>root!.unmount());root=undefined;await act(async()=>old());expect(state.transfer).not.toHaveBeenCalled();
});
it("does not revive a selection after its source changes and returns",async()=>{
 await render();await select(7,12);await render("different source");await render();await click("Add quote to draft");expect(state.transfer).not.toHaveBeenCalled();
});

beforeEach(()=>{security.allowed=true;state.buttons=[];state.selections=[];});
it("does not transfer an old page or selection through a retained callback",async()=>{
 await render("before EXACT after"+"x".repeat(12000));await select(7,12);const old=state.buttons.filter(button=>button.label==="Add quote to draft").at(-1)!.press;await click("Next");await act(async()=>old());expect(state.transfer).not.toHaveBeenCalled();
});
it("retires draft insertion on a transient lock/return without sending",async()=>{
 await render();await select(7,12);const old=state.buttons.filter(button=>button.label==="Add quote to draft").at(-1)!.press;await act(async()=>{security.allowed=false;security.listeners.forEach(fn=>fn());security.allowed=true;security.listeners.forEach(fn=>fn());old();});await click("Add quote to draft");expect(state.transfer).not.toHaveBeenCalled();
});

it("quotes the exact visible selection after CRLF line endings",async()=>{
 await render("before\r\nEXACT after");const visible=container.querySelector("textarea")!.value,start=visible.indexOf("EXACT");await select(start,start+5);await click("Add quote to draft");expect(state.transfer).toHaveBeenCalledWith({machineId:"machine",sessionId:"session",text:"> EXACT"});
});

it("ignores a selection event from a retired page even after returning to the same page",async()=>{
 await render("before EXACT after"+"x".repeat(12000));const old=state.selections.at(-1)!;await click("Next");await click("Back");await act(async()=>old({nativeEvent:{selection:{start:7,end:12}}}));await click("Add quote to draft");expect(state.transfer).not.toHaveBeenCalled();await select(7,12);await click("Add quote to draft");expect(state.transfer).toHaveBeenCalledWith({machineId:"machine",sessionId:"session",text:"> EXACT"});
});
it("ignores retained page navigation after another page becomes current",async()=>{
 await render("x".repeat(24000)+"third page");const next=state.buttons.find(button=>button.label==="Next")!.press;await click("Next");await click("Next");await act(async()=>next());expect(container.querySelector("textarea")!.value).toBe("third page");
});
