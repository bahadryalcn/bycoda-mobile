// @vitest-environment happy-dom
import { act,createElement,type PropsWithChildren,type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach,expect,it,vi } from "vitest";
import { JiraBoardIssueActions } from "./jira-board-issue";
const state=vi.hoisted(()=>({project:"project",submit:vi.fn(),confirms:[] as Array<()=>void>}));
vi.mock("@/state/machines",()=>({useMachines:{getState:()=>({activeId:"machine",selectedProjectId:state.project})}}));
vi.mock("@/ui/copy",()=>({useCopy:()=>(_tr:string,en:string)=>en}));
vi.mock("@/ui/confirm",()=>({confirmAction:(_title:string,_body:string,_label:string,apply:()=>void)=>state.confirms.push(apply)}));
vi.mock("../workspace/shared",()=>({ErrorText:()=>null}));
vi.mock("./jira-board-delivery",()=>({useJiraBoardDelivery:()=>({draft:{ready:true,error:null,value:null},busy:false,error:null,result:null,submit:state.submit})}));
vi.mock("./provider-queries",()=>({useInboxRead:()=>({data:[{id:"4",name:"Start work",statusId:"2",requiresFields:false},{id:"8",name:"Requires custom field",statusId:"3",requiresFields:true}],isFetching:false})}));
vi.mock("@/ui/primitives",()=>{
 const Wrap=({children}:PropsWithChildren)=>createElement("div",null,children);
 return{Body:Wrap,Stack:Wrap,QueryState:()=>null,Sheet:({children,footer}:PropsWithChildren<{footer?:ReactNode}>)=>createElement("div",null,children,footer),Notice:({message}:{message:string})=>createElement("p",null,message),Button:({label,disabled,onPress}:{label:string;disabled?:boolean;onPress:()=>void})=>createElement("button",{disabled,onClick:onPress},label),
  SelectField:({label,value,options,onChange,disabled}:{label:string;value:string;options:{value:string;label:string}[];onChange:(value:string)=>void;disabled:boolean})=>createElement("select",{"aria-label":label,value,disabled,onChange:event=>onChange((event.currentTarget as HTMLSelectElement).value)},createElement("option",{value:""},"Choose"),...options.map(option=>createElement("option",{key:option.value,value:option.value},option.label))),
 };
});
const issue={identifier:"ENG-7",title:"Reviewed issue",state:"Open"};const snapshot={snapshotId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",board:{id:7,name:"Engineering",kind:"scrum"},configuration:{rankSnapshotAvailable:true,sprints:[{id:3,name:"Active sprint"}]},page:{issues:[issue,{identifier:"ENG-8",title:"Anchor"}]}};
const props={origin:{machineId:"machine",projectId:"project"},snapshot,issue,canWrite:true,onChanged:vi.fn(),onClose:vi.fn()};
const container=document.createElement("div");let root:ReturnType<typeof createRoot>;
async function mount(){vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);root=createRoot(container);await act(async()=>root.render(createElement(JiraBoardIssueActions,props as never)));}
async function choose(label:string,value:string){await act(async()=>{const select=container.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;select.value=value;select.dispatchEvent(new Event("change",{bubbles:true}));});}
async function click(label:string){await act(async()=>[...container.querySelectorAll("button")].find(button=>button.textContent===label)!.click());}
afterEach(async()=>{await act(async()=>root?.unmount());state.project="project";state.confirms=[];vi.clearAllMocks();vi.unstubAllGlobals();});
it("prepares only a displayed rank anchor and requires explicit confirmation before requesting native approval",async()=>{
 await mount();expect(state.submit).not.toHaveBeenCalled();await choose("Action","rank");await choose("Displayed anchor issue","ENG-8");
 await click("Review action");expect(state.submit).not.toHaveBeenCalled();await act(async()=>state.confirms[0]!());
 expect(state.submit).toHaveBeenCalledExactlyOnceWith({action:"jira-board-move",input:{projectId:"project",snapshotId:snapshot.snapshotId,key:"ENG-7",confirm:"CHANGE_JIRA_BOARD",target:"rank",beforeKey:"ENG-8"}});
});
it("keeps field-requiring transitions unavailable and refuses a confirmation after project identity changes",async()=>{
 await mount();expect(container.textContent).toContain("Complete transitions requiring additional fields in Jira");
 expect(container.querySelector('select[aria-label="Jira transition"]')?.textContent).not.toContain("Requires custom field");
 await choose("Jira transition","4");await click("Review action");state.project="other";await act(async()=>state.confirms[0]!());expect(state.submit).not.toHaveBeenCalled();
});
