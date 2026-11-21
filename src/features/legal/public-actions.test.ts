// @vitest-environment jsdom
import { act, createElement, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
const fixture=vi.hoisted(()=>({open:vi.fn(),share:vi.fn(),copy:vi.fn(),handlers:new Map<string,()=>void>()}));
vi.mock("expo-clipboard", () => ({ setStringAsync: fixture.copy }));
vi.mock("react-native",()=>({View:({children}:PropsWithChildren)=>createElement("div",null,children),Linking:{openURL:fixture.open},Share:{share:fixture.share},findNodeHandle:()=>12}));
vi.mock("react-native-reanimated",()=>({default:{View:({children}:PropsWithChildren)=>createElement("div",null,children)}}));
vi.mock("expo-router",()=>({router:{push:vi.fn()}}));
vi.mock("expo-constants",()=>({default:{expoConfig:{version:"1.0",android:{package:"com.bycoda.mobile"},extra:{engagement:{androidPlayStoreUrl:"https://play.google.com/store/apps/details?id=com.bycoda.mobile"}}}}}));
vi.mock("expo-application", () => ({ nativeApplicationVersion: "1.0", nativeBuildVersion: "1", applicationId: "com.bycoda.mobile" }));
vi.mock("@/ui/theme",()=>({useMobileTheme:() => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} })}));vi.mock("@/ui/copy",()=>({useCopy:()=> (_tr:string,en:string,values?:Record<string,string|number>)=>en.replace(/\{(p\d)\}/g,(_match,key:string)=>String(values?.[key]??""))}));
vi.mock("@/ui/info-hint",()=>({HintSection:({title,children}:PropsWithChildren<{title:string}>)=>createElement("section",null,createElement("h2",null,title),children)}));
vi.mock("@/ui/styles",()=>({uiStyles:{}}));vi.mock("@/ui/tokens",()=>({colors:{},space:{},lineHeight:{}}));vi.mock("@/ui/motion",()=>({enterItem:()=>undefined}));vi.mock("@/ui/icon-tile",()=>({IconTile:()=>null}));
vi.mock("lucide-react-native/icons/star",()=>({default:()=>null}));vi.mock("lucide-react-native/icons/external-link",()=>({default:()=>null}));vi.mock("lucide-react-native/icons/share-2",()=>({default:()=>null}));vi.mock("lucide-react-native/icons/globe",()=>({default:()=>null}));vi.mock("lucide-react-native/icons/message-square",()=>({default:()=>null}));vi.mock("lucide-react-native/icons/flag",()=>({default:()=>null}));vi.mock("lucide-react-native/icons/smartphone",()=>({default:()=>null}));
vi.mock("@/ui/primitives",()=>{
 const Wrapper=({children}:PropsWithChildren)=>createElement("div",null,children);
 return {Body:Wrapper,Heading:Wrapper,Stack:Wrapper,NavigationGroup:Wrapper,Disclosure:({label,children}:PropsWithChildren<{label:string}>)=>{const[open,setOpen]=useState(false);return createElement("div",null,createElement("button",{"aria-expanded":open,onClick:()=>setOpen(!open)},label),open?children:null);},Section:({title,children}:PropsWithChildren<{title:string}>)=>createElement("section",null,createElement("h2",null,title),children),
 Button:({label,onPress}:{label:string;onPress:()=>void})=>createElement("button",{onClick:onPress},label),
 NavigationRow:({label,detail,onPress,disabled}:{label:string;detail?:string;onPress:()=>void;disabled?:boolean})=>{fixture.handlers.set(label,onPress);return createElement("button",{onClick:onPress,disabled},label,detail?createElement("span",null,detail):null);},
 Notice:({message}:{message:string})=>createElement("p",{role:"alert"},message),
 MutationState:({mutation}:{mutation:{error?:Error}})=>mutation.error?createElement("p",{role:"alert"},mutation.error.message):null,
 };
});
import { LegalDocument } from "./legal-document";
import { legalSections, mitLicense, supportEmail } from "./legal-content";
import { EngagementSettings } from "../engagement/engagement-settings";
vi.mock("@/ui/brand", () => ({ BrandLogo: () => null }));
let root:ReturnType<typeof createRoot>|undefined,container:HTMLDivElement,client:QueryClient;
const render=(document:"help"|"privacy"|"terms"|"engagement"="help")=>act(async()=>root!.render(createElement(QueryClientProvider,{client},document==="engagement"?createElement(EngagementSettings):createElement(LegalDocument,{document}))));
const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
const button=(name:string)=>[...container.querySelectorAll("button")].find(item=>item.textContent?.startsWith(name))!;
it("lets the reader copy the public support address only after email handoff fails", async () => {
  await render();
  expect(button("Copy")).toBeUndefined();
  fixture.open.mockRejectedValueOnce(new Error("No email handler"));
  fixture.copy.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await act(async () => button("Open email app").click());
  await settle();
  expect(button("Copy")).toBeDefined();
  await act(async () => button("Copy").click());
  await settle();
  expect(container.textContent).toContain("Could not copy. Try again.");
  await act(async () => button("Copy").click());
  await settle();
  expect(fixture.copy.mock.calls).toEqual([[supportEmail], [supportEmail]]);
  expect(fixture.open).toHaveBeenCalledOnce();
  expect(button("Copied")).toBeDefined();
  fixture.open.mockRejectedValueOnce(new Error("No browser handler"));
  await act(async () => button("bycoda website").click());
  await settle();
  expect(button("Copy")).toBeUndefined();
});
it("opens the real product website from Help and About", async () => {
 await render();
 await act(async () => button("bycoda website").click());
 await settle();
 expect(fixture.open).toHaveBeenLastCalledWith("https://bycoda.codes");
 await render("engagement");
 await act(async () => button("bycoda website").click());
 await settle();
 expect(fixture.open).toHaveBeenLastCalledWith("https://bycoda.codes");
});
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);vi.stubEnv("EXPO_OS","android");container=document.createElement("div");root=createRoot(container);client=new QueryClient();fixture.open.mockResolvedValue(undefined);fixture.share.mockResolvedValue({action:"dismissedAction"});});
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;client.clear();fixture.handlers.clear();vi.resetAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it("renders About version and build as whole localized messages", async () => {
 await render("engagement");
 expect(container.textContent).toContain("Version: 1.0");
 expect(container.textContent).toContain("Build: 1");
 expect(container.textContent).not.toContain("Version: Unknown");
});
it("claims legal link opening synchronously and leaves failure under the originating row",async()=>{
 let reject!:(error:Error)=>void;fixture.open.mockImplementationOnce(()=>new Promise((_done,fail)=>{reject=fail;}));await render();
 await act(async()=>{button("Open email app").click();button("GitHub project & public issues").click();});
 expect(fixture.open).toHaveBeenCalledTimes(1);expect(fixture.open.mock.calls[0][0]).toMatch(/^mailto:/);
 await act(async()=>reject(new Error("Native handoff failed")));await settle();
 expect(button("Open email app").parentElement?.textContent).toContain("The email app could not be opened.");
 expect(button("GitHub project & public issues").parentElement?.textContent).not.toContain("The link could not be opened.");
});
it("clears the previous legal error when another explicit link is opened",async()=>{
 fixture.open.mockRejectedValueOnce(new Error("failed"));await render();await act(async()=>button("Open email app").click());await settle();
 expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
 await act(async()=>button("GitHub project & public issues").click());await settle();expect(container.querySelectorAll('[role="alert"]')).toHaveLength(0);expect(fixture.open).toHaveBeenCalledTimes(2);
});
it("retires legal callbacks when the document changes or unmounts",async()=>{
 await render();const old=fixture.handlers.get("GitHub project & public issues")!;await render("terms");await act(async()=>old());await settle();expect(fixture.open).not.toHaveBeenCalled();
 const current=fixture.handlers.get("Source code & license")!;await act(async()=>root!.unmount());root=undefined;await act(async()=>current());await settle();expect(fixture.open).not.toHaveBeenCalled();
});
// The About actions report in one place under their group, so a failure never shifts the rows below it.
it("shows a public-page failure once, under the action group",async()=>{
 fixture.open.mockRejectedValueOnce(new Error("failed"));await render("engagement");await act(async()=>button("App page").click());await settle();
 const message=container.querySelector('[role="alert"]')!;expect(message).not.toBeNull();
 expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
 expect(button("App page").compareDocumentPosition(message)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();expect(button("Send feedback").compareDocumentPosition(message)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
it("does not let another tap steal a pending share's cancellation feedback",async()=>{
 let finish!:(value:{action:string})=>void;fixture.share.mockImplementationOnce(()=>new Promise(done=>{finish=done;}));await render("engagement");
 await act(async()=>{button("Share the app").click();button("App page").click();});expect(fixture.share).toHaveBeenCalledTimes(1);expect(fixture.open).not.toHaveBeenCalled();
 await act(async()=>finish({action:"dismissedAction"}));const notice=[...container.querySelectorAll("div")].find(node=>node.textContent==="Sharing was cancelled.")!;
 expect(notice).toBeDefined();expect(button("App page").compareDocumentPosition(notice)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
it("does not launch public actions from retained callbacks after unmount",async()=>{
 await render("engagement");const old=fixture.handlers.get("Share the app")!,page=fixture.handlers.get("App page")!;await act(async()=>root!.unmount());root=undefined;
 await act(async()=>{old();page();});expect(fixture.share).not.toHaveBeenCalled();expect(fixture.open).not.toHaveBeenCalled();
});


it("puts help contact actions before closed topics without removing any topic text",async()=>{
 await render();
 const first=button(legalSections.help[0].title[1]);
 expect(first).toBeDefined();expect(first.getAttribute("aria-expanded")).toBe("false");
 expect(button("Open email app").compareDocumentPosition(first)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 for(const section of legalSections.help){
  const topic=button(section.title[1]);expect(topic.getAttribute("aria-expanded")).toBe("false");
  await act(async()=>topic.click());
  for(const paragraph of section.paragraphs)expect(container.textContent).toContain(paragraph[1]);
 }
 expect(fixture.open).not.toHaveBeenCalled();expect(fixture.share).not.toHaveBeenCalled();
});

it.each(["privacy","terms"] as const)("keeps the complete %s text expanded and links after it",async(document)=>{
 await render(document);
 for(const section of legalSections[document])for(const paragraph of section.paragraphs)expect(container.textContent).toContain(paragraph[1]);
 expect(container.querySelector('[aria-expanded]')).toBeNull();
 if(document==="terms")expect(container.textContent).toContain(mitLicense);
 const firstHeading=container.querySelector("h2")!;
 expect(firstHeading.compareDocumentPosition(button("Open email app"))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("measures the license and contact blocks for the reader's jump list", async () => {
  const measure = vi.fn(() => () => {});
  await act(async () => root!.render(
    createElement(QueryClientProvider, { client }, createElement(LegalDocument, { document: "terms", sectionLayout: measure })),
  ));
  expect(measure.mock.calls.slice(-2)).toEqual([["mit-license"], ["contact-links"]]);
});

it("keeps a selected help topic open while its contact action fails locally",async()=>{
 await render();const topic=button(legalSections.help[0].title[1]);await act(async()=>topic.click());
 fixture.open.mockRejectedValueOnce(new Error("Handoff failed"));await act(async()=>button("Open email app").click());await settle();
 expect(topic.getAttribute("aria-expanded")).toBe("true");
 expect(container.textContent).toContain(legalSections.help[0].paragraphs[0][1]);
 expect(button("Open email app").parentElement?.textContent).toContain("The email app could not be opened.");
});
