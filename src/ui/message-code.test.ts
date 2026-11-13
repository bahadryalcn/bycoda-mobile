// @vitest-environment jsdom
import { act,createElement,type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
const f=vi.hoisted(()=>({copied:[] as string[],html:[] as string[], fills:[] as boolean[]}));
vi.mock("@/state/security",()=>({isAppAccessAllowed:()=>true,useSecurity:{getState:()=>({appState:"active",windowFocused:true}),subscribe:()=>()=>{}}}));
vi.mock("@/ui/theme",()=>({useMobileTheme:() => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} })}));vi.mock("./copy",()=>({useCopy:()=> (_tr:string,en:string)=>en}));
vi.mock("./tokens",()=>({colors:{},radii:{},space:{}}));vi.mock("./chat-styles",()=>({useChatTextStyles:(size:string)=>({code:{readerSize:size},metadata:{}})}));
vi.mock("@/state/chat-appearance",()=>({useChatAppearance:(select:(value:{textSize:string})=>unknown)=>select({textSize:"standard"})}));
vi.mock("expo-clipboard",()=>({setStringAsync:async(value:string)=>{f.copied.push(value);}}));
vi.mock("react-native",()=>({Text:({children}:PropsWithChildren)=>createElement("span",null,children),View:({children}:PropsWithChildren)=>createElement("div",null,children),ScrollView:({children}:PropsWithChildren)=>createElement("main",null,children)}));
vi.mock("./html-document",()=>({HtmlDocument:({html,fill}:{html:string;fill?:boolean})=>{f.html.push(html);f.fills.push(!!fill);return createElement("div",null,"HTML preview body");}}));
vi.mock("./chat-controls",()=>({ChatToolbarAction:({label,onPress}:{label:string;onPress:()=>void})=>createElement("button",{onClick:onPress},label)}));
vi.mock("./primitives",()=>{
 const Wrapper=({children}:PropsWithChildren)=>createElement("div",null,children);
 return {Body:Wrapper,Row:Wrapper,CodePanel:Wrapper,CodeText:({children,style}:PropsWithChildren<{style?:unknown}>)=>createElement("pre",{"data-code-source":true,"data-code-style":JSON.stringify(style)},children),ErrorText:()=>null,Loading:()=>null,
 Button:({label,onPress,disabled}:{label:string;onPress:()=>void;disabled?:boolean})=>createElement("button",{onClick:onPress,disabled},label),
 Sheet:({visible,children,footer,title}:PropsWithChildren<{visible:boolean;title:string;footer?:import("react").ReactNode}>)=>visible?createElement("section",{"data-title":title},children,createElement("footer",null,footer)):null};
});
import { MessageCode } from "./message-code";
let root:ReturnType<typeof createRoot>|undefined,container:HTMLDivElement;
let props:{code:string;language:string;complete?:boolean;textSize?:"compact"|"standard"|"large";readerTitle?:string;copyLabel?:string;allowPreview?:boolean;output?:boolean;error?:boolean};
const render=()=>act(async()=>root!.render(createElement(MessageCode,props)));
const open=()=>act(async()=>[...container.querySelectorAll("button")].find(button=>button.textContent?.startsWith("Show all code"))!.click());
const click=(label:string)=>act(async()=>[...container.querySelector("section footer")!.querySelectorAll("button")].find(button=>button.textContent===label)!.click());
const source=()=>container.querySelector("section [data-code-source]")!.textContent!;
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);container=document.createElement("div");root=createRoot(container);props={code:"x".repeat(11999)+"🙂\n  const value = 2;\n"+"z".repeat(15000)+"\nEND",language:"typescript",textSize:"large"};});
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;f.copied=[];f.html=[];vi.unstubAllGlobals();});
it("bounds every expanded page, preserves exact Unicode/spacing and copies the whole original from the footer",async()=>{
 await render();await open();const slices=[source()];expect(slices[0].length).toBeLessThanOrEqual(12001);expect(container.querySelector("section footer")?.textContent).toContain("1 / 3");
 await click("Next");slices.push(source());await click("Next");slices.push(source());expect(slices.every(slice=>slice.length<=12001)).toBe(true);expect(slices.join("")).toBe(props.code);
 await click("Copy code");expect(f.copied).toEqual([props.code]);expect(container.querySelector("section main")?.textContent).not.toContain("Copy code");
});
it("preserves page and reading size changes and clamps an obsolete page after shrink/regrowth",async()=>{
 await render();await open();await click("Next");props={...props,textSize:"compact"};await render();expect(container.querySelector("section footer")?.textContent).toContain("2 / 3");expect(container.querySelector("section [data-code-style]")?.getAttribute("data-code-style")).toContain("compact");
 const long=props.code;props={...props,code:"short"};await render();expect(source()).toBe("short");props={...props,code:long};await render();expect(container.querySelector("section footer")?.textContent).toContain("1 / 3");
});
it("previews the entire complete HTML source rather than its selected page",async()=>{
 props={code:"<p>"+"x".repeat(13000)+"</p>",language:"html",complete:false};await render();await open();expect(container.querySelector("section footer")?.textContent).not.toContain("Preview");expect(container.querySelector("section footer")?.textContent).toContain("Code is still arriving");
 props={...props,complete:true};await render();await click("Next");await click("Preview");expect(f.html.at(-1)).toBe(props.code);expect(f.fills.at(-1)).toBe(true);
});

it("preserves a document's reader identity and contextual copy label",async()=>{
 props={...props,readerTitle:"LICENSE",copyLabel:"Copy"};await render();await open();expect(container.querySelector("section")?.getAttribute("data-title")).toBe("LICENSE");
 await click("Copy");expect(f.copied).toEqual([props.code]);
});

it("lets a document owner provide its single preview action while retaining full source access",async()=>{
 props={code:"<p>"+"x".repeat(13000)+"</p>",language:"html",allowPreview:false};await render();expect([...container.querySelectorAll("button")].some(button=>button.textContent==="Preview")).toBe(false);
 await open();expect(container.querySelector("section footer")?.textContent).not.toContain("Preview");expect(source()).toHaveLength(12000);
});

it("bounds default chat code to eight lines while copying the entire source", async () => {
 props={code:Array.from({length:20},(_,i)=>`const recoveryStep${i} = "保存";`).join("\n"),language:"typescript"};
 await render();
 expect(container.textContent).not.toContain("recoveryStep8");
 await act(async()=>[...container.querySelectorAll("button")].find(button=>button.textContent==="Copy code")!.click());
 expect(f.copied).toEqual([props.code]);
 await open();expect(source()).toBe(props.code);
});

it("keeps failed streaming output visible, bounded and fully copyable without executable preview", async () => {
 props={code:"<p>native provider output</p>\n".repeat(30)+"FAIL: owning computer changed",language:"html",output:true,error:true,complete:false};
 await render();
 expect(container.textContent).toContain("Failed");
 expect(container.textContent).toContain("Output is still arriving");
 expect(container.textContent).not.toContain("FAIL: owning computer changed");
 expect([...container.querySelectorAll("button")].some(button=>button.textContent==="Preview")).toBe(false);
 await act(async()=>[...container.querySelectorAll("button")].find(button=>button.textContent?.startsWith("Show all output"))!.click());
 expect(source()).toBe(props.code);
 expect(container.querySelector("section footer")?.textContent).toContain("Failed");
 await click("Copy output");expect(f.copied).toEqual([props.code]);
});
