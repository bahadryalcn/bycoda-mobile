// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f=vi.hoisted(()=>({open:false,change:undefined as undefined|((open:boolean)=>void),rows:new Map<string,()=>void>(),allowed:true}));
vi.mock("./theme",()=>({useMobileTheme:()=>undefined}));
vi.mock("react-native",()=>({View:({children,...props}:any)=>createElement("div",{ref:props.ref},children),useWindowDimensions:()=>({height:640,width:320})}));
vi.mock("react-native-safe-area-context",()=>({useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}));
vi.mock("lucide-react-native/icons/ellipsis",()=>({default:()=>null}));
vi.mock("lucide-react-native/icons/check",()=>({default:()=>null}));
vi.mock("./buttons",()=>({IconButton:({children}:any)=>createElement("button",null,children)}));
vi.mock("./copy",()=>({useCopy:()=> (_tr:string,en:string)=>en}));
vi.mock("./motion",()=>({haptic:{select:()=>{}}}));
vi.mock("./private-access",()=>({usePrivateContentAccess:()=>({allowed:f.allowed,check:()=>f.allowed})}));
vi.mock("panelui-native/components/menu",()=>({Menu:Object.assign(({open,onOpenChange,children}:any)=>{f.open=open;f.change=onOpenChange;return children;},{Trigger:({children}:any)=>children,Content:({children}:any)=>f.open?children:null,Item:({children,onSelect}:any)=>{f.rows.set(children,onSelect);return createElement("span",null,children);}})}));
import {ActionMenu,type MenuAction} from "./overflow-menu";
let root:ReturnType<typeof createRoot>,node:HTMLDivElement;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;f.open=false;f.allowed=true;f.rows.clear();node=document.createElement("div");document.body.append(node);root=createRoot(node);});
afterEach(()=>{act(()=>root.unmount());node.remove();});
const render=(actions:MenuAction[])=>act(()=>root.render(createElement(ActionMenu,{label:"Project options",actions})));
const open=()=>act(()=>f.change!(true));
it("resets an empty menu and rejects late events from its retired trigger after choices return",()=>{
 const action={key:"inspect",label:"Inspect",onPress:vi.fn()};render([action]);open();const retired=f.change!;render([]);render([action]);expect(f.open).toBe(false);act(()=>retired(true));expect(f.open).toBe(false);open();expect(f.open).toBe(true);act(()=>retired(false));expect(f.open).toBe(true);
});
it("accepts only one selection from an open menu and rejects retained callbacks after it closes",()=>{
 const run=vi.fn();render([{key:"inspect",label:"Inspect",onPress:run}]);open();const select=f.rows.get("Inspect")!;act(()=>{select();select();});expect(run).toHaveBeenCalledOnce();expect(f.open).toBe(false);
});
it("rejects a replaced choice without dispatching a different target under the same key",()=>{
 const old=vi.fn(),current=vi.fn();render([{key:"inspect",label:"Inspect",onPress:old}]);open();const retired=f.rows.get("Inspect")!;render([{key:"inspect",label:"Inspect replacement",onPress:current}]);act(()=>retired());expect(old).not.toHaveBeenCalled();expect(current).not.toHaveBeenCalled();expect(f.open).toBe(true);act(()=>f.rows.get("Inspect replacement")!());expect(current).toHaveBeenCalledOnce();
});
it("rechecks disabled state and live private access before dispatch",()=>{
 const run=vi.fn();render([{key:"inspect",label:"Inspect",onPress:run}]);open();const before=f.rows.get("Inspect")!;render([{key:"inspect",label:"Inspect",onPress:run,disabled:true}]);act(()=>{before();f.rows.get("Inspect")!();});expect(run).not.toHaveBeenCalled();render([{key:"inspect",label:"Inspect",onPress:run}]);f.allowed=false;act(()=>f.rows.get("Inspect")!());expect(run).not.toHaveBeenCalled();expect(node.querySelector("button")).toBeNull();f.allowed=true;render([{key:"inspect",label:"Inspect",onPress:run}]);expect(f.open).toBe(false);
});
it("retires a hidden private menu and returns with a closed trigger",()=>{
 const action={key:"inspect",label:"Inspect",onPress:vi.fn()};render([action]);open();f.allowed=false;render([action]);f.allowed=true;render([action]);expect(f.open).toBe(false);open();expect(f.open).toBe(true);
});
it("does not dispatch a retained selection from an unmounted menu owner",()=>{
 const run=vi.fn();render([{key:"inspect",label:"Inspect",onPress:run}]);open();const select=f.rows.get("Inspect")!;act(()=>root.render(null));act(()=>select());expect(run).not.toHaveBeenCalled();
});
