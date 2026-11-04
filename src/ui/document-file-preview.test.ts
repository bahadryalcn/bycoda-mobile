// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/ui/theme",()=>({useMobileTheme:()=>{}}));
vi.mock("react-native",()=>({View:({children}:PropsWithChildren)=>createElement("div",null,children)}));
vi.mock("@tanstack/react-query",()=>({useQuery:({enabled}:{enabled:boolean})=>({data:enabled?"source":undefined,isFetching:false,isSuccess:enabled,isError:false,error:null,refetch:vi.fn()})}));
vi.mock("./document-content",()=>({ProjectMediaContent:()=>null,DocumentContent:({onOpenFile,context}:{context:unknown;onOpenFile:(path:string,context:unknown)=>void})=>createElement("button",{onClick:()=>onOpenFile("child.txt",context)},"Open child")}));
vi.mock("./copy",()=>({useCopy:()=> (_tr:string,en:string)=>en}));
vi.mock("@/i18n",()=>({useLocale:()=>"en"}));
vi.mock("@/state/queries",()=>({useHostClient:()=>({machine:{id:"same",endpoint:"http://one",environmentId:"local"}})}));
vi.mock("./media-loader",()=>({loadProjectMedia:vi.fn()}));
vi.mock("./use-private-media-data",()=>({usePrivateMediaData:(_key:unknown,query:any)=>query.data}));
vi.mock("./use-list-scroll-memory",()=>({useFilteredListScrollMemory:()=>({listProps:{}})}));
vi.mock("./layout",()=>({ScreenChromeProvider:({children}:PropsWithChildren)=>children}));
vi.mock("./use-reader-scope",async()=>{const{useMemo}=await import("react");return{
 useReaderScope:()=>({ready:true,available:true,current:()=>true,assertCurrent:()=>{},close:(close:()=>void)=>close()}),
 useReaderContentAccess:(_scope:unknown,proof:unknown)=>{const port=useMemo(()=>({}),[proof]);return{port,check:()=>true,access:{allowed:true,check:()=>true}};},
 useReaderRetry:()=>({retry:()=>{},retryError:()=>{}}),
};});
vi.mock("./primitives",()=>{const Wrapper=({children}:PropsWithChildren)=>createElement("div",null,children);return {Body:Wrapper,Button:Wrapper,CodePanel:Wrapper,CodeText:Wrapper,Disclosure:Wrapper,ErrorText:()=>null,Loading:()=>null,NavigationGroup:Wrapper,NavigationRow:Wrapper,FormActions:()=>null,Notice:()=>null,Empty:()=>null,ScreenList:Wrapper,SearchField:()=>null,
 Sheet:({children,title}:PropsWithChildren<{title:string}>)=>createElement("section",{"data-title":title},children)};});
import { ScopedFilePreview } from "./document-file-preview";
import type { MessageContext } from "./media-policy";
let root:ReturnType<typeof createRoot>,container:HTMLDivElement;
const render=(path:string,endpoint="http://one")=>{const context={machineId:"same",projectId:"project",cwd:"/project",client:{machine:{environmentId:"local",endpoint}}} as unknown as MessageContext;return act(async()=>root.render(createElement(ScopedFilePreview,{path,context,onClose:()=>{}})));};
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);container=document.createElement("div");root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());vi.unstubAllGlobals();});
it.each([['b.txt','http://one'],['a.txt','http://two']])("retires nested navigation when file/scope changes to %s at %s",async(path,endpoint)=>{
 await render("a.txt");await act(async()=>container.querySelector("button")!.click());expect(container.querySelectorAll("section")).toHaveLength(2);
 await render(path,endpoint);expect(container.querySelectorAll("section")).toHaveLength(1);expect(container.querySelector("section")!.dataset.title).toBe(path);
});
