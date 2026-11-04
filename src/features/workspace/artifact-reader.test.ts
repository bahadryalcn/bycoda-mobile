// @vitest-environment happy-dom
import { act,createElement,type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { ArtifactReader } from "./artifact-reader";
const f=vi.hoisted(()=>({allowed:true,copied:[] as string[],callbacks:new Map<string,()=>void>(),fills:[] as boolean[],interactions:[] as any[]}));
vi.mock("@/state/security",()=>({isAppAccessAllowed:()=>true,useSecurity:{getState:()=>({appState:"active",windowFocused:true}),subscribe:()=>()=>{}}}));
vi.mock("@/state/chat-appearance",()=>({useChatAppearance:(select:any)=>select({textSize:"standard"})}));
vi.mock("@/ui/copy",()=>({useCopy:()=> (_tr:string,en:string)=>en}));
vi.mock("@/ui/private-access",()=>({usePrivateContentAccess:()=>({allowed:f.allowed,check:()=>f.allowed})}));
vi.mock("expo-clipboard",()=>({setStringAsync:async(value:string)=>{f.copied.push(value);}}));
vi.mock("react-native",()=>({View:({children}:PropsWithChildren)=>createElement("div",null,children),ScrollView:({children}:PropsWithChildren)=>createElement("main",null,children)}));
vi.mock("@/ui/code-source",()=>({CodeSource:({code}:any)=>createElement("pre",null,code)}));
vi.mock("@/ui/html-document",()=>({HtmlDocument:({fill,interaction}:any)=>{f.fills.push(fill);f.interactions.push(interaction);return createElement("article",null,"HTML sandbox preview");}}));
vi.mock("@/ui/primitives",()=>{
 const wrap=({children}:PropsWithChildren)=>createElement("div",null,children);
 const button=({label,onPress,disabled}:any)=>{f.callbacks.set(label,onPress);return createElement("button",{onClick:onPress,disabled},label);};
 return{Body:wrap,Row:wrap,Stack:wrap,Button:button,NavigationRow:button,ErrorText:()=>null,Notice:({message}:any)=>createElement("div",null,message),QueryState:()=>null,
 FormActions:({submitLabel,onSubmit,cancelLabel,onCancel}:any)=>createElement("div",null,button({label:submitLabel,onPress:onSubmit}),onCancel?button({label:cancelLabel,onPress:onCancel}):null),ActionMenu:({actions}:any)=>createElement("div",null,...actions.map((a:any)=>createElement("div",{key:a.key},button(a)))),
 Sheet:({children,footer,headerAction,scroll,title}:any)=>createElement("section",{"data-scroll":String(scroll),"aria-label":title},headerAction,children,createElement("footer",null,footer))};
});
let root:ReturnType<typeof createRoot>,container:HTMLDivElement;
const summary={id:"artifact-a",sessionId:"session-a",title:"Full title",createdAt:"2026-10-21T12:00:00Z",bytes:30000};
let props:any;
const render=()=>act(async()=>root.render(createElement(ArtifactReader,props)));
const click=(label:string)=>act(async()=>f.callbacks.get(label)!());
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);container=document.createElement("div");root=createRoot(container);props={summary,artifact:{...summary,html:"x".repeat(11999)+"🙂"+"y".repeat(14000)+" SOURCE-END"},machineName:"Original computer",query:{isSuccess:true},unavailable:false,onBack:vi.fn()};});
afterEach(async()=>{await act(async()=>root.unmount());f.allowed=true;f.copied=[];f.callbacks.clear();f.fills=[];f.interactions=[];vi.unstubAllGlobals();});
it("fills one preview viewport without an outer sheet scroller",async()=>{await render();expect(f.fills).toEqual([true]);expect(container.querySelector("section")?.getAttribute("data-scroll")).toBe("false");expect(container.querySelectorAll("section")).toHaveLength(1);});
it("pages exact Unicode source and copies the complete payload from any page",async()=>{await render();await click("Show source");const pages=[container.querySelector("pre")!.textContent];await click("Next");pages.push(container.querySelector("pre")!.textContent);await click("Next");pages.push(container.querySelector("pre")!.textContent);expect(pages.join("")).toBe(props.artifact.html);expect(pages.every(p=>p!.length<=12001)).toBe(true);await click("Copy");expect(f.copied).toEqual([props.artifact.html]);});
it("discloses full title and original identity in Details",async()=>{await render();await click("Full title");expect(container.textContent).toContain("Full title");expect(container.textContent).toContain("Original computer");expect(container.textContent).toContain("artifact-a");expect(container.querySelector("article")).toBeNull();await click("Preview");expect(container.querySelector("article")).not.toBeNull();});
it("conceals cached metadata and HTML when the read becomes unavailable",async()=>{await render();await click("Full title");props={...props,artifact:undefined,unavailable:true};await render();expect(container.textContent).not.toContain("Full title");expect(container.textContent).not.toContain("artifact-a");expect(container.textContent).toContain("Record access is unavailable");expect(container.querySelector("article")).toBeNull();});
it("retires page and mode callbacks when the source changes",async()=>{await render();await click("Show source");const next=f.callbacks.get("Next")!;const mode=f.callbacks.get("Preview")!;props={...props,artifact:{...props.artifact,html:"New exact source"}};await render();await act(async()=>{next();mode();});expect(container.querySelector("pre")?.textContent).toBe("New exact source");expect(container.querySelector("article")).toBeNull();});
it("rejects retained copy and Back callbacks after private access loss",async()=>{await render();await click("Show source");const copy=f.callbacks.get("Copy")!,back=f.callbacks.get("Back to list")!;f.allowed=false;await act(async()=>{copy();back();});expect(f.copied).toEqual([]);expect(props.onBack).not.toHaveBeenCalled();});
it("returns to the list exactly when explicitly pressed",async()=>{await render();await click("Back to list");expect(props.onBack).toHaveBeenCalledOnce();});
it("retires every old reader callback after unmount",async()=>{await render();await click("Show source");const back=f.callbacks.get("Back to list")!,copy=f.callbacks.get("Copy")!;await act(async()=>root.unmount());await act(async()=>{back();copy();});expect(props.onBack).not.toHaveBeenCalled();expect(f.copied).toEqual([]);});

it("retains interaction off across source and preview transitions",async()=>{await render();await act(async()=>f.interactions.at(-1).toggle());await click("Show source");await click("Preview");expect(f.interactions.at(-1).enabled).toBe(false);});
