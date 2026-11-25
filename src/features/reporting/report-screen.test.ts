// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
const fixture=vi.hoisted(()=>({sender:null as import("./report-delivery").ReportSender|null,submits:[] as Array<{label:string;run:()=>void}>,locked:false}));
vi.mock("@/ui/theme",()=>({useMobileTheme:() => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} })}));
vi.mock("./report-config",()=>({get reportSender(){return fixture.sender;}}));
vi.mock("expo-crypto",()=>({randomUUID:()=>"screen-request"}));
vi.mock("expo-router",()=>({Stack:{Screen:()=>null},router:{push:vi.fn(),canGoBack:()=>true,back:vi.fn()}}));
vi.mock("@/state/security",()=>({assertAppAccess:()=>{if(fixture.locked)throw Error("Locked");}}));
vi.mock("@/ui/copy",()=>({useCopy:()=> (_tr:string,en:string,values?:{p0:string})=>en.replace("{p0}",values?.p0??"{p0}")}));
vi.mock("@/ui/motion",()=>({enterItem:()=>undefined}));
vi.mock("@/ui/info-hint",()=>({useInfoHint:()=>({button:null,panel:null})}));
vi.mock("@/ui/styles",()=>({uiStyles:{}}));vi.mock("@/ui/tokens",()=>({colors:{},space:{}}));
vi.mock("@/ui/icon-tile",()=>({IconTile:()=>null}));vi.mock("lucide-react-native/icons/flag",()=>({default:()=>null}));
vi.mock("react-native",()=>({View:({children}:PropsWithChildren)=>createElement("div",null,children)}));
vi.mock("react-native-reanimated",()=>({default:{View:({children}:PropsWithChildren)=>createElement("div",null,children)}}));
vi.mock("@/ui/consent-field",()=>({ConsentField:()=>null}));
vi.mock("@/ui/primitives",()=>{
 const Wrapper=({children}:PropsWithChildren)=>createElement("div",null,children);
 return {Body:Wrapper,NavigationGroup:Wrapper,NavigationRow:()=>null,RowIcon:()=>null,Disclosure:()=>null,Section:Wrapper,Button:()=>null,ToggleField:()=>null,SelectField:()=>null,useSuccessToast:()=>()=>"",
 StateView:({title,description}:{title:string;description:string})=>createElement("p",{"data-state-view":true},title," ",description),
 Screen:({children,footer}:PropsWithChildren<{footer:import("react").ReactNode}>)=>createElement("main",null,createElement("article",null,children),createElement("footer",null,footer)),
 Field:({label,error,hint,maxLength,onBlur}:{label:string;error?:string;hint?:string;maxLength?:number;onBlur?:()=>void})=>createElement("section",{"data-field":label,"data-max":maxLength,"data-hint":hint,tabIndex:0,onBlur},error),
 ErrorText:({error,message}:{error:unknown;message:string})=>error?createElement("p",null,message):null,
 Notice:({message}:{message:string})=>createElement("p",null,message),
 Sheet:({visible,children}:PropsWithChildren<{visible:boolean}>)=>visible?createElement("aside",null,children):null,
 FormActions:({submitLabel,onSubmit,disabled,cancelLabel,onCancel,feedback}: {submitLabel:string;onSubmit:()=>void;disabled:boolean;cancelLabel:string;onCancel:()=>void;feedback?:import("react").ReactNode})=>{fixture.submits.push({label:submitLabel,run:onSubmit});return createElement("div",null,feedback,createElement("button",{disabled,onClick:onSubmit},submitLabel),createElement("button",{onClick:onCancel},cancelLabel));},
 };
});
import { ContentReportScreen } from "./report-screen";
import { discardContentReport,updateContentReport,useContentReport } from "./report-store";
let root:ReturnType<typeof createRoot>|undefined,container:HTMLDivElement;
const render=()=>act(async()=>root!.render(createElement(ContentReportScreen)));
const button=(label:string,last=false)=>{const found=[...(last ? container.querySelector("aside")! : container).querySelectorAll("button")].filter(item=>item.textContent===label);return last?found.at(-1)!:found[0];};
beforeEach(async()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);discardContentReport();fixture.sender=null;fixture.locked=false;fixture.submits=[];container=document.createElement("div");root=createRoot(container);await render();});
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;vi.unstubAllGlobals();});
it("replaces the form with one unavailable state when no service is configured",async()=>{
 expect(container.querySelector("[data-state-view]")?.textContent).toContain("Reports can’t be sent right now");
 expect(container.querySelector('[data-field="Description"]')).toBeNull();
 expect(button("Send")).toBeUndefined();
});
it("keeps an existing draft readable but locked, with Close as the action, when no service is configured",async()=>{
 await act(async()=>{updateContentReport({description:"Draft from a message"});useContentReport.setState({error:"service"});});
 const message="Reporting is not available yet. Your draft is kept while this app remains running.";
 expect([...container.querySelectorAll("p")].filter(p=>p.textContent===message)).toHaveLength(1);
 expect(button("Close").disabled).toBe(false);
 expect(button("Send")).toBeUndefined();
 expect(button("Discard draft")).toBeDefined();
});
it("replaces the editor with a permanent acknowledgement after delivery",async()=>{
 await act(async()=>{updateContentReport({description:"Reviewed report"});useContentReport.setState({status:"sent",receiptId:"receipt-one"});});
 expect(container.textContent).toContain("Report received.");
 expect(container.textContent).toContain("receipt-one");
 expect(container.querySelector("[data-state-view]")?.textContent).toContain("Reference: receipt-one");
 expect(container.querySelector('[data-field="Description"]')).toBeNull();
 expect(button("Discard draft")).toBeUndefined();
 expect(button("Done").disabled).toBe(false);
});
it("keeps the reviewed draft and offers an explicit retry with the same request ID",async()=>{
 const sender=vi.fn<NonNullable<typeof fixture.sender>>()
   .mockRejectedValueOnce(new Error("Offline")).mockResolvedValue({requestId:"screen-request",reportId:"receipt"});
 fixture.sender=sender;
 await act(async()=>{updateContentReport({description:"Reviewed report"});updateContentReport({consent:true});});
 await act(async()=>button("Send").click());
 expect(container.querySelector("footer")?.textContent).toContain("Delivery could not be confirmed.");
 expect(useContentReport.getState().draft.description).toBe("Reviewed report");
 await act(async()=>button("Retry").click());
 expect(sender.mock.calls.map(([id])=>id)).toEqual(["screen-request","screen-request"]);
 expect(useContentReport.getState().draft.description).toBe("");
});
it("acknowledges the receipt on Done so Report content can be used again", async () => {
  fixture.sender = vi.fn(async (requestId) => ({ requestId, reportId: "receipt" }));
  await act(async () => useContentReport.setState({ status: "sent", receiptId: "receipt-one" }));
  const done = fixture.submits.filter((action) => action.label === "Done").at(-1)!.run;
  await act(async () => button("Done").click());
  expect(useContentReport.getState()).toMatchObject({ status: "idle", receiptId: null });
  expect(container.querySelector('[data-field="Description"]')).not.toBeNull();
  await act(async () => updateContentReport({ description: "Next report" }));
  await act(async () => done());
  expect(useContentReport.getState().draft.description).toBe("Next report");
});
it("keeps description validation with its field",async()=>{
 await act(async()=>updateContentReport({consent:true}));expect(container.querySelector('[data-field="Description"]')?.textContent).toContain("Write a description");
});
it("explains next to Send why it is disabled before consent and keeps the field limits visible",async()=>{
 fixture.sender=vi.fn(async requestId=>({requestId,reportId:"receipt"}));await render();
 const footer=()=>container.querySelector("footer")!.textContent;
 expect(footer()).toContain("Write a description to enable Send.");expect(button("Send").disabled).toBe(true);
 expect(container.querySelector('[data-field="Description"]')?.textContent).toBe("");
 await act(async()=>updateContentReport({description:"Spam"}));
 expect(footer()).toContain("Tick the consent below to enable Send.");expect(button("Send").disabled).toBe(true);
 const field=container.querySelector('[data-field="Description"]')!;
 expect(field.getAttribute("data-max")).toBe("2000");expect(field.getAttribute("data-hint")).toBe("4 / 2000");
 await act(async()=>updateContentReport({consent:true}));
 expect(footer()).not.toContain("to enable Send.");expect(button("Send").disabled).toBe(false);
});
it("flags a blank description beside its field once the user leaves it",async()=>{
 fixture.sender=vi.fn(async requestId=>({requestId,reportId:"receipt"}));await render();
 const field=()=>container.querySelector('[data-field="Description"]')!;
 expect(field().textContent).toBe("");
 await act(async()=>{field().dispatchEvent(new FocusEvent("focusout",{bubbles:true}));});
 expect(field().textContent).toContain("Write a description.");
});
it("retires discard review after a draft changes and rejects callbacks from an earlier review",async()=>{
 await act(async()=>updateContentReport({description:"First report"}));const original=useContentReport.getState();
 await act(async()=>button("Discard draft").click());const old=fixture.submits.filter(x=>x.label==="Discard draft").at(-1)!.run;
 await act(async()=>updateContentReport({description:"New report"}));expect(button("Discard draft",true).disabled).toBe(true);
 await act(async()=>useContentReport.setState(original));expect(button("Discard draft",true).disabled).toBe(true);
 await act(async()=>button("Keep draft").click());await act(async()=>button("Discard draft").click());
 await act(async()=>old());expect(useContentReport.getState().draft.description).toBe("First report");
 fixture.locked=true;await act(async()=>button("Discard draft",true).click());expect(useContentReport.getState().draft.description).toBe("First report");
 fixture.locked=false;await act(async()=>button("Discard draft",true).click());expect(useContentReport.getState().draft.description).toBe("");
});
it("never sends from a retained callback after the screen unmounts",async()=>{
 fixture.sender=vi.fn(async requestId=>({requestId,reportId:"receipt"}));await act(async()=>{updateContentReport({description:"Report"});updateContentReport({consent:true});});
 const submit=fixture.submits.filter(x=>x.label==="Send").at(-1)!.run;await act(async()=>root!.unmount());root=undefined;await act(async()=>submit());expect(fixture.sender).not.toHaveBeenCalled();
});
it("keeps only the must-see privacy warning inline; the full explanation sits behind the info icon",async()=>{
 fixture.sender=vi.fn(async requestId=>({requestId,reportId:"receipt"}));await render();
 expect(container.textContent).toContain("Do not add access keys, pairing codes, private files or personal information.");
 expect(container.textContent).not.toContain("kept only in memory");
});
