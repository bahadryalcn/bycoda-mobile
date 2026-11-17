// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { DocumentContent } from "./document-content";
vi.mock("./preview-audio", () => ({ AudioPlayer: () => createElement("p", null, "Audio preview") }));
vi.mock("./preview-zip-list", () => ({ ZipList: () => createElement("p", null, "Archive preview") }));
vi.mock("./preview-csv-table", () => ({ CsvTable: () => createElement("p", null, "CSV preview") }));

const sharing = vi.hoisted(() => ({ share: vi.fn().mockRejectedValue(new Error("Cached file no longer exists")), sources:[] as Array<{code:string;language?:string}>, read:vi.fn(), buttons: [] as Array<{label:string;press:()=>void}> }));
vi.mock("@/state/security", () => ({ isAppAccessAllowed: () => true, useSecurity: { getState: () => ({appState:"active",windowFocused:true}), subscribe: () => () => {} } }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("expo-file-system", () => ({ File: class { text(){ return sharing.read(); } } }));
vi.mock("expo-sharing", () => ({ isAvailableAsync: async () => true, shareAsync: sharing.share }));
vi.mock("./media-loader", () => ({ loadProjectMedia: vi.fn() }));
vi.mock("./message-content", () => ({ MessageContent: () => createElement("p",null,"Rendered markdown") }));
vi.mock("./message-code", () => ({ MessageCode: (props:{code:string;language?:string}) => {sharing.sources.push(props);return createElement("p",null,"Bounded source preview");} }));
vi.mock("./message-image", () => ({ MessageImage: () => null }));
vi.mock("./html-document", () => ({ HtmlDocument: () => createElement("p",null,"Rendered HTML") }));
vi.mock("./pdf-document", () => ({ PdfDocument: ({ name }: { name: string }) => createElement("p", null, `PDF reader: ${name}`) }));
vi.mock("./media-video", () => ({ InlineVideo: ({ name }: { name: string }) => createElement("p", null, `Video player: ${name}`) }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./tokens", () => ({ space: { sm: 8 } }));
vi.mock("./primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: wrapper, Row: wrapper, CodePanel: wrapper, CodeText: wrapper, Loading: () => null,
    ErrorText: ({ error }: { error: unknown }) => error ? createElement("p", { role: "alert" }, String(error)) : null,
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => { sharing.buttons.push({label,press:onPress}); return createElement("button", { onClick: onPress }, label); } };
});

const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
const cache = new QueryClient();
afterEach(async () => { await act(async () => root?.unmount()); cache.clear(); sharing.buttons = []; sharing.sources=[]; sharing.read.mockReset(); sharing.share.mockClear(); vi.unstubAllGlobals(); });

it("offers parent media reload after an evicted PDF fails to share", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  const reload = vi.fn();
  await act(async () => root.render(createElement(QueryClientProvider, { client: cache }, createElement(DocumentContent, { name: "report.pdf", mimeType: "application/pdf", uri: "file:///evicted.pdf", onReload: reload }))));
  await act(async () => container.querySelector("button")!.click());
  expect(sharing.share).toHaveBeenCalledWith("file:///evicted.pdf", expect.anything());
  expect(container.textContent).toContain("Cached file no longer exists");
  const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Reload file")!;
  await act(async () => retry.click());
  expect(reload).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("rejects retained Reload callbacks after a reader changes file",async()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);root=createRoot(container);const oldReload=vi.fn(),nextReload=vi.fn();
 const render=(uri:string,onReload:()=>void)=>act(async()=>root.render(createElement(QueryClientProvider,{client:cache},createElement(DocumentContent,{name:uri,mimeType:"application/pdf",uri,onReload}))));
 await render("file:///a.pdf",oldReload);await act(async()=>container.querySelector("button")!.click());const old=sharing.buttons.filter(button=>button.label==="Reload file").at(-1)!.press;
 await render("file:///b.pdf",nextReload);await act(async()=>container.querySelector("button")!.click());await act(async()=>old());
 expect(oldReload).not.toHaveBeenCalled();expect(nextReload).not.toHaveBeenCalled();expect(container.textContent).toContain("Cached file no longer exists");
 await act(async()=>sharing.buttons.filter(button=>button.label==="Reload file").at(-1)!.press());expect(nextReload).toHaveBeenCalledTimes(1);
});

const press = (label: string) => act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === label)!.click());
it.each([["archive.zip", "Archive preview"], ["recording.mp3", "Audio preview"]])("routes %s to the specialized preview and retains sharing", async (name, preview) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root = createRoot(container);
  await act(async () => root.render(createElement(QueryClientProvider, { client: cache }, createElement(DocumentContent, { name, uri: "file:///download" }))));
  expect(container.textContent).toContain(preview);
  expect(container.textContent).toContain("Share / save");
  expect(sharing.read).not.toHaveBeenCalled();
});
it.each([["report.PDF", "PDF reader: report.PDF"], ["clip.mp4", "Video player: clip.mp4"]])("opens %s in its reader instead of treating bytes as text", async (name, expected) => {
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root=createRoot(container);
 await act(async()=>root.render(createElement(QueryClientProvider,{client:cache},createElement(DocumentContent,{name,mimeType:"Application/Octet-Stream; charset=binary",uri:"file:///download"}))));
 await act(async()=>{await new Promise(done=>setTimeout(done,10));});
 expect(container.textContent).toContain(expected);expect(container.textContent).toContain("Share / save");expect(sharing.read).not.toHaveBeenCalled();
});
it.each(["budget.xlsx", "slides.pptx"])("keeps %s available through explicit system handoff",async name=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);root=createRoot(container);
 await act(async()=>root.render(createElement(QueryClientProvider,{client:cache},createElement(DocumentContent,{name,uri:"file:///download"}))));
 expect(container.textContent).toContain("Open this file in another app.");expect(container.textContent).toContain("Share / save");expect(sharing.read).not.toHaveBeenCalled();expect(sharing.share).not.toHaveBeenCalled();
});
it("offers source mode for markdown recognized by its filename", async () => {
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root=createRoot(container);
 await act(async()=>root.render(createElement(QueryClientProvider,{client:cache},createElement(DocumentContent,{name:"README.MD",mimeType:"application/octet-stream",text:"# Original"}))));
 expect(container.textContent).toContain("Rendered markdown"); expect(container.textContent).toContain("Show source");
 await press("Show source"); expect(sharing.sources.at(-1)?.code).toBe("# Original");
});
it("resets display mode for a different file while preserving it for the current file", async () => {
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root=createRoot(container);
 const render=(name:string,text:string)=>act(async()=>root.render(createElement(QueryClientProvider,{client:cache},createElement(DocumentContent,{name,mimeType:"text/html",text}))));
 await render("a.html","<h1>First</h1>"); await press("Show source"); await render("a.html","<h1>Updated</h1>");
 expect(container.textContent).toContain("Preview"); expect(sharing.sources.at(-1)?.code).toBe("<h1>Updated</h1>");
 await render("b.html","<h1>Second</h1>"); expect(container.textContent).toContain("Rendered HTML"); expect(container.textContent).toContain("Show source");
});
it("provides bounded source rendering with the complete original payload", async () => {
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); root=createRoot(container);const text="const value = 1;\n".repeat(3000);
 await act(async()=>root.render(createElement(QueryClientProvider,{client:cache},createElement(DocumentContent,{name:"sample.ts",text}))));
 expect(sharing.sources.at(-1)?.code).toBe(text); expect(sharing.sources.at(-1)?.language).toBe("ts");
 expect(container.textContent!.length).toBeLessThan(1000);
});
it("shows a local read failure with Retry rather than an unsupported-file instruction", async () => {
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);root=createRoot(container);sharing.read.mockRejectedValueOnce(new Error("Synthetic local read failed")).mockResolvedValue("recovered source");
 await act(async()=>root.render(createElement(QueryClientProvider,{client:cache},createElement(DocumentContent,{name:"notes.txt",mimeType:"text/plain",uri:"file:///notes.txt"}))));
 await act(async()=>{await new Promise(done=>setTimeout(done,10));});
 expect(container.textContent).toContain("Synthetic local read failed");expect(container.textContent).not.toContain("Open this file in another app.");
 await press("Retry");await act(async()=>{await new Promise(done=>setTimeout(done,10));});
 expect(sharing.read).toHaveBeenCalledTimes(2);expect(sharing.sources.at(-1)?.code).toBe("recovered source");
});

it("uses a plain text identity for extensionless files and accepts MIME parameters", async () => {
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);root=createRoot(container);
 const render=(name:string,mimeType:string)=>act(async()=>root.render(createElement(QueryClientProvider,{client:cache},createElement(DocumentContent,{name,mimeType,text:"source"}))));
 await render("/project/LICENSE","text/plain");expect(sharing.sources.at(-1)?.language).toBe("text");
 await render("/project/index.html","Text/HTML; charset=utf-8");expect(container.textContent).toContain("Rendered HTML");expect(container.textContent).toContain("Show source");
});
it("retires source mode when the same path changes Host endpoint", async () => {
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);root=createRoot(container);
 const render=(endpoint:string)=>{const context={machineId:"same",projectId:"project",cwd:"/project",client:{machine:{environmentId:"local",endpoint}}} as unknown as import("./media-policy").MessageContext;
 return act(async()=>root.render(createElement(QueryClientProvider,{client:cache},createElement(DocumentContent,{name:"/project/index.html",mimeType:"text/html",text:"source",context}))));};
 await render("http://one");await press("Show source");await render("http://two");expect(container.textContent).toContain("Rendered HTML");expect(container.textContent).toContain("Show source");
});
it("does not start an old local-file retry after the reader changes file", async () => {
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);root=createRoot(container);sharing.read.mockRejectedValue(new Error("Synthetic local read failed"));
 const render=(name:string,text?:string)=>act(async()=>root.render(createElement(QueryClientProvider,{client:cache},createElement(DocumentContent,{name,mimeType:"text/plain",uri:"file:///"+name,text}))));
 await render("old.txt");await act(async()=>{await new Promise(done=>setTimeout(done,10));});const old=sharing.buttons.filter(button=>button.label==="Retry").at(-1)!.press;
 await render("new.txt","new source");await act(async()=>old());expect(sharing.read).toHaveBeenCalledTimes(1);expect(sharing.sources.at(-1)?.code).toBe("new source");
});
