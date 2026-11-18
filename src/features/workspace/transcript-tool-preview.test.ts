// @vitest-environment jsdom
import { act,createElement,type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
const f=vi.hoisted(()=>({writes:[] as string[],buttons:[] as {label:string;press:()=>void}[]}));
vi.mock("lucide-react-native/icons/file",()=>({default:()=>null}));
vi.mock("@/state/chat-appearance",()=>({useChatAppearance:(select:(v:{textSize:string})=>unknown)=>select({textSize:"standard"})}));
vi.mock("@/ui/theme",()=>({useMobileTheme:() => ({ mode: "dark", colors: {}, semanticColors: { success: { text: "s", surface: "ss" }, danger: { text: "d", surface: "ds" } }, uiStyles: {} })}));
vi.mock("@/state/security",()=>({isAppAccessAllowed:()=>true,useSecurity:{getState:()=>({appState:"active",windowFocused:true}),subscribe:()=>()=>{}}}));
vi.mock("react-native",()=>({View:({children}:PropsWithChildren)=>createElement("div",null,children),ScrollView:({children}:PropsWithChildren)=>createElement("main",null,children),Text:({children}:PropsWithChildren)=>createElement("span",null,children)}));
vi.mock("expo-clipboard",()=>({setStringAsync:async(value:string)=>{f.writes.push(value);}}));
vi.mock("@/ui/message-text",()=>({ScopedFilePreview:({path}:{path:string})=>createElement("aside",null,path)}));
vi.mock("@/ui/copy",()=>({useCopy:()=> (_tr:string,en:string)=>en}));
vi.mock("@/ui/chat-controls",()=>({ChatSummary:({label,detail,status,onPress}:{label:string;detail?:string;status?:string;onPress:()=>void})=>createElement("button",{onClick:onPress,"data-detail":detail,"data-status":status},label)}));
vi.mock("@/ui/primitives",()=>{const Wrapper=({children}:PropsWithChildren)=>createElement("div",null,children);return {Body:Wrapper,Row:Wrapper,CodePanel:Wrapper,CodeText:({children}:PropsWithChildren)=>createElement("pre",null,children),ErrorText:({error}:{error:unknown})=>error?createElement("p",null,String(error)):null,
 Button:({label,onPress,disabled}:{label:string;onPress:()=>void;disabled?:boolean})=>{f.buttons.push({label,press:onPress});return createElement("button",{onClick:onPress,disabled},label);},
 Sheet:({visible,children,footer,title}:PropsWithChildren<{visible:boolean;title:string;footer?:import("react").ReactNode}>)=>visible?createElement("section",{"data-title":title},children,createElement("footer",null,footer)):null};});
import { TranscriptToolPreview } from "./transcript-tool-preview";
import type { MessageContext } from "@/ui/media-policy";
import type { Block } from "./wire";
let root:ReturnType<typeof createRoot>,container:HTMLDivElement,preview:NonNullable<NonNullable<Block["tool"]>["preview"]>;
const context={machineId:"m",projectId:"p",cwd:"/project",client:{machine:{environmentId:"local",endpoint:"fixture://one"}}} as unknown as MessageContext;
const render=()=>act(async()=>root.render(createElement(TranscriptToolPreview,{preview,context,status:"completed"})));
const click=(label:string)=>act(async()=>[...container.querySelectorAll("button")].find(b=>b.textContent===label)!.click());
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);f.writes=[];f.buttons=[];container=document.createElement("div");root=createRoot(container);preview={kind:"write",path:"a.ts",lines:[{kind:"add",number:1,text:"source"}]};});
afterEach(async()=>{await act(async()=>root.unmount());vi.unstubAllGlobals();});
it("bounds a huge line/output and exposes the complete prepared source through pages and copy",async()=>{
 preview={...preview,lines:Array.from({length:350},(_,i)=>({kind:"add",number:i+1,text:i===0?"x".repeat(14000):"line "+i})),output:"tail "+"y".repeat(14000)};await render();await click("a.ts");
 const texts=[...container.querySelectorAll("section pre")].map(e=>e.textContent||"").join("");expect(texts.length).toBeLessThanOrEqual(12001);expect(container.querySelector("footer")?.textContent).toContain("Next");await click("Copy");expect(f.writes[0]).toContain("350 + line 349");expect(f.writes[0]).toContain(preview.output);
});
it("does not retarget an already opened file after the preview path changes",async()=>{
 await render();await click("a.ts");await click("Open file");expect(container.querySelector("aside")?.textContent).toBe("a.ts");preview={...preview,path:"b.ts"};await render();expect(container.querySelector("aside")).toBeNull();
});

it("retains an opened file's line target through updates to the same preview",async()=>{
 preview={...preview,startLine:12};await render();await click("a.ts");await click("Open file");preview={...preview,startLine:90};await render();expect(container.querySelector("aside")?.textContent).toBe("a.ts:12");
});
it("serializes source and path copy taps before a render",async()=>{
 await render();await click("a.ts");const source=f.buttons.find(button=>button.label==="Copy")!.press,path=f.buttons.find(button=>button.label==="Copy path")!.press;
 await act(async()=>{source();path();});expect(f.writes).toEqual(["1 + source"]);await click("Copy path");expect(f.writes).toEqual(["1 + source","a.ts"]);
});
it("keeps proposed/applied/rejected status honest without closing a stable preview",async()=>{
 const show=(status:string)=>act(async()=>root.render(createElement(TranscriptToolPreview,{preview,context,status})));
 await show("running");await click("a.ts");expect(container.textContent).toContain("Proposed change");await show("completed");expect(container.textContent).toContain("Applied");await show("failed");expect(container.textContent).toContain("Not applied");expect(container.querySelector("section")).not.toBeNull();
});

it("shows failed write status before opening and calls read previews output", async () => {
 await act(async()=>root.render(createElement(TranscriptToolPreview,{preview,context,status:"failed"})));
 expect(container.querySelector("button")?.getAttribute("data-status")).toBe("Not applied");
 preview={...preview,kind:"read"};await render();
 expect(container.querySelector("button")?.getAttribute("data-detail")).toContain("Open output");
 expect(container.querySelector("button")?.getAttribute("data-detail")).not.toContain("Open change");
});
