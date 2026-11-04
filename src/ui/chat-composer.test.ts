import { expect, it, vi } from "vitest";
function flatten(value:any):any{return Array.isArray(value)?Object.assign({},...value.filter(Boolean).map(flatten)):value??{};}
vi.mock("react-native",()=>({View:"View",StyleSheet:{flatten:(value:any)=>flatten(value)}}));
vi.mock("./theme",()=>({useMobileTheme:()=>undefined}));
vi.mock("panelui-native/components/ai-input",()=>({AIInput:Object.assign(()=>null,{Field:"Field",Row:"Row"})}));
import { ChatComposer } from "./chat-composer";
it("preserves the feature's larger input floor and exact field callbacks",()=>{
 const selection=vi.fn(),change=vi.fn(),layout=vi.fn();const view=ChatComposer({value:"Draft",onValueChange:change,leading:null,submit:null,onToolbarLayout:layout,field:{style:{minHeight:82,maxHeight:90},onSelectionChange:selection}});const [field,row]=view.props.children;expect(flatten(field.props.style).minHeight).toBe(82);expect(flatten(field.props.style).maxHeight).toBe(90);expect(field.props.onSelectionChange).toBe(selection);expect(row.props.onLayout).toBe(layout);expect(view.props.onValueChange).toBe(change);expect(view.props.avoidKeyboard).toBe(false);
});
it("retains a full touch-sized field for missing or undersized caller geometry",()=>{
 for(const minHeight of [undefined,20,NaN]){const view=ChatComposer({value:"",onValueChange:()=>{},leading:null,submit:null,field:{style:{minHeight}}});expect(flatten(view.props.children[0].props.style).minHeight).toBe(48);}
});
