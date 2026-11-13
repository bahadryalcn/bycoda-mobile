// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  queryFn: undefined as undefined | ((context: { signal: AbortSignal }) => Promise<unknown>),
  data: "source" as unknown,
  loadMedia: vi.fn(),
}));
vi.mock("@/ui/theme",()=>({useMobileTheme:() => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} })}));
vi.mock("react-native",()=>({View:({children}:PropsWithChildren)=>createElement("div",null,children)}));
vi.mock("@tanstack/react-query",()=>({useQuery:({enabled,queryFn}:{enabled:boolean;queryFn:typeof fixture.queryFn})=>{if(enabled)fixture.queryFn=queryFn;return {data:enabled?fixture.data:undefined,isFetching:false,isSuccess:enabled,isError:false,error:null,refetch:vi.fn()};}}));
vi.mock("./document-content",()=>({ProjectMediaContent:()=>null,DocumentContent:({onOpenFile,context,uri}:{uri?:string;context:unknown;onOpenFile:(path:string,context:unknown)=>void})=>createElement("button",{"data-uri":uri,onClick:()=>onOpenFile("child.txt",context)},"Open child")}));
vi.mock("./copy",()=>({useCopy:()=> (_tr:string,en:string)=>en}));
vi.mock("@/i18n",()=>({useLocale:()=>"en"}));
vi.mock("@/state/queries",()=>({useHostClient:()=>({machine:{id:"same",endpoint:"http://one",environmentId:"local"}})}));
vi.mock("./media-loader",()=>({loadProjectMedia:fixture.loadMedia}));
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
const render=(path:string,endpoint="http://one",request?:unknown)=>{const context={machineId:"same",projectId:"project",cwd:"/project",client:{machine:{environmentId:"local",endpoint},request}} as unknown as MessageContext;return act(async()=>root.render(createElement(ScopedFilePreview,{path,context,onClose:()=>{}})));};
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);container=document.createElement("div");root=createRoot(container);fixture.data="source";fixture.queryFn=undefined;fixture.loadMedia.mockReset().mockResolvedValue({uri:"file://preview",name:"preview.bin",mimeType:"application/octet-stream"});});
afterEach(async()=>{await act(async()=>root.unmount());vi.unstubAllGlobals();});
it.each([['b.txt','http://one'],['a.txt','http://two']])("retires nested navigation when file/scope changes to %s at %s",async(path,endpoint)=>{
 await render("a.txt");await act(async()=>container.querySelector("button")!.click());expect(container.querySelectorAll("section")).toHaveLength(2);
 await render(path,endpoint);expect(container.querySelectorAll("section")).toHaveLength(1);expect(container.querySelector("section")!.dataset.title).toBe(path);
});
it.each(["report.docx", "budget.xlsx", "slides.pptx", "archive.tar", "font.otf", "voice.opus", "photo.heic", "report.pdf#L42", "report.docx:12:3"])("dispatches binary file link %s without a text read", async path => {
  const request = vi.fn(); await render(path, "http://one", request);
  const signal = new AbortController().signal;
  await expect(fixture.queryFn!({ signal })).resolves.toMatchObject({ uri: "file://preview" });
  expect(request).not.toHaveBeenCalled();
  expect(fixture.loadMedia).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ projectId: "project", cwd: "/project" }), path, signal);
});
it.each(["README", ".env.local", "config.custom"])("reads custom/extensionless text %s through the original text owner", async path => {
  const request = vi.fn().mockResolvedValue("Preserved text"); await render(path, "http://one", request);
  const signal = new AbortController().signal;
  await expect(fixture.queryFn!({ signal })).resolves.toBe("Preserved text");
  expect(request).toHaveBeenCalledExactlyOnceWith("workspace.run", { command: "read_text_file", args: { path: `/project/${path}` } }, { signal });
  expect(fixture.loadMedia).not.toHaveBeenCalled();
});
it("reclassifies an unknown file only when the successful text read contains binary NUL", async () => {
  const request = vi.fn().mockResolvedValue("binary\0contents"); await render("unknown.custom", "http://one", request);
  fixture.data = await fixture.queryFn!({ signal: new AbortController().signal });
  await render("unknown.custom", "http://one", request);
  expect(fixture.loadMedia).toHaveBeenCalledOnce();
  expect(container.querySelector('[data-uri="file://preview"]')).not.toBeNull();
});
it.each([["notes.md", "text/markdown"], ["notes.txt", "text/plain"]])("keeps NUL-bearing %s out of local text decoding", async (path, mimeType) => {
  const request = vi.fn().mockResolvedValue("binary\0contents");
  fixture.loadMedia.mockResolvedValue({ uri: "file://preview", name: path, mimeType });
  await render(path, "http://one", request);
  const result = await fixture.queryFn!({ signal: new AbortController().signal });
  expect(result).toEqual({ uri: "file://preview", name: path, mimeType: "application/x-bycoda-binary" });
  expect(request).toHaveBeenCalledTimes(1);
  expect(fixture.loadMedia).toHaveBeenCalledTimes(1);
});
it("does not turn denied or failed text reads into a binary fallback", async () => {
  const error = Object.assign(new Error("Access denied"), { kind: "auth" });
  const request = vi.fn().mockRejectedValue(error); await render("unknown.custom", "http://one", request);
  await expect(fixture.queryFn!({ signal: new AbortController().signal })).rejects.toBe(error);
  expect(fixture.loadMedia).not.toHaveBeenCalled();
});
