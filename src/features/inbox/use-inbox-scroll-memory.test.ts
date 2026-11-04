// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useInboxScrollMemory } from "./use-inbox-scroll-memory";
import { createInboxBrowseMemory } from "./inbox-browse-memory";
const origin={machineId:"computer",projectId:"project"};
let root:ReturnType<typeof createRoot>|undefined,bindings:any;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{act(()=>root?.unmount());root=undefined;document.body.replaceChildren();});
function mount(memory:Pick<ReturnType<typeof createInboxBrowseMemory>,"scroll">,offset:number,rowCount=80){
 const host=document.createElement("div");document.body.append(host);root=createRoot(host);
 function Probe({ready,suspended}:{ready:boolean;suspended:boolean}){const scroll=useInboxScrollMemory(memory,origin,offset,ready,rowCount,{suspended});bindings={...scroll.listProps,cancelRestore:scroll.cancelRestore};return null;}
 const render=(ready:boolean,suspended=false)=>act(()=>root!.render(createElement(Probe,{ready,suspended})));render(false);
 const scroll=vi.fn();bindings.ref.current={scrollToOffset:scroll};return{render,scroll};
}
const event=(y:number)=>({nativeEvent:{contentOffset:{x:0,y}}});
it("waits for current data and both measurements, then restores exactly once",()=>{
 const memory=createInboxBrowseMemory(origin);memory.scroll(origin,500);const{render,scroll}=mount(memory,500);
 act(()=>{bindings.onLayout({nativeEvent:{layout:{height:300}}});bindings.onContentSizeChange(320,1200);bindings.onScroll(event(0));});
 expect(scroll).not.toHaveBeenCalled();expect(memory.read(origin)!.offset).toBe(500);
 render(true);act(()=>bindings.onScroll(event(500)));expect(scroll).toHaveBeenCalledExactlyOnceWith({offset:500,animated:false});
 act(()=>{bindings.onLayout({nativeEvent:{layout:{height:350}}});bindings.onContentSizeChange(320,1400);bindings.onScroll(event(620));});
 expect(scroll).toHaveBeenCalledOnce();expect(memory.read(origin)!.offset).toBe(620);
});
it("lets a user's scroll override pending restoration",()=>{
 const memory=createInboxBrowseMemory(origin);memory.scroll(origin,500);const{render,scroll}=mount(memory,500);
 act(()=>{bindings.onScrollBeginDrag(event(100));bindings.onLayout({nativeEvent:{layout:{height:300}}});bindings.onContentSizeChange(320,1200);});
 render(true);expect(scroll).not.toHaveBeenCalled();expect(memory.read(origin)!.offset).toBe(100);
});
it("clamps a shorter current list and remembers zero even when no native scroll event follows",()=>{
 const memory=createInboxBrowseMemory(origin);memory.scroll(origin,500);const{render,scroll}=mount(memory,500,1);
 act(()=>{bindings.onLayout({nativeEvent:{layout:{height:400}}});bindings.onContentSizeChange(320,200);});
 render(true);act(()=>bindings.onViewableItemsChanged({viewableItems:[{index:0,isViewable:true}]}));expect(scroll).toHaveBeenCalledExactlyOnceWith({offset:500,animated:false});expect(memory.read(origin)!.offset).toBe(0);
});

it("does not accept an initial partial virtualized extent as the final scroll limit",()=>{
 const memory=createInboxBrowseMemory(origin);memory.scroll(origin,1000);const{render,scroll}=mount(memory,1000);
 act(()=>{bindings.onLayout({nativeEvent:{layout:{height:508}}});bindings.onContentSizeChange(320,1126);});
 render(true);act(()=>bindings.onScroll(event(618)));
 expect(memory.read(origin)!.offset).toBe(1000);
 act(()=>{bindings.onContentSizeChange(320,5758);bindings.onScroll(event(1000));});
 expect(scroll).toHaveBeenCalledTimes(2);expect(scroll).toHaveBeenLastCalledWith({offset:1000,animated:false});
 expect(memory.read(origin)!.offset).toBe(1000);
});

it("does not restore an old reading position after a new visible search or filter action",()=>{
 const memory=createInboxBrowseMemory(origin);memory.scroll(origin,500);const{render,scroll}=mount(memory,500);
 act(()=>{bindings.onLayout({nativeEvent:{layout:{height:300}}});bindings.onContentSizeChange(320,1200);bindings.cancelRestore();});
 render(true);expect(scroll).not.toHaveBeenCalled();expect(memory.read(origin)!.offset).toBe(0);
});

it("restores an offset-only Attention port without modifying the provider position",()=>{
 const memory=createInboxBrowseMemory(origin);memory.scroll(origin,120);memory.attention.scroll(origin,500);
 const{render,scroll}=mount(memory.attention,500);
 act(()=>{bindings.onLayout({nativeEvent:{layout:{height:300}}});bindings.onContentSizeChange(320,1200);});
 expect(scroll).not.toHaveBeenCalled();render(true);act(()=>bindings.onScroll(event(500)));
 expect(scroll).toHaveBeenCalledExactlyOnceWith({offset:500,animated:false});
 act(()=>bindings.onScroll(event(640)));
 expect(memory.attention.read(origin)).toEqual({offset:640});expect(memory.read(origin)!.offset).toBe(120);
});

it("preserves the reading target through concealment and ignores hidden zero scroll/cancel/drag events",()=>{
 const memory=createInboxBrowseMemory(origin);const{render,scroll}=mount(memory,0);render(true);
 act(()=>{bindings.onLayout({nativeEvent:{layout:{height:300}}});bindings.onContentSizeChange(320,3000);bindings.onScroll(event(900));});expect(memory.read(origin)!.offset).toBe(900);
 render(false,true);act(()=>{bindings.onContentSizeChange(320,100);bindings.onScroll(event(0));bindings.cancelRestore();bindings.onScrollBeginDrag(event(0));});expect(memory.read(origin)!.offset).toBe(900);
 render(true,false);act(()=>{bindings.onContentSizeChange(320,3000);bindings.onScroll(event(900));});expect(scroll).toHaveBeenLastCalledWith({offset:900,animated:false});expect(memory.read(origin)!.offset).toBe(900);
});
it("does not mistake a new search's loading phase for privacy suspension",()=>{
 const memory=createInboxBrowseMemory(origin);const{render,scroll}=mount(memory,0);render(true);act(()=>{bindings.onScroll(event(700));bindings.cancelRestore();});render(false,false);act(()=>bindings.onScroll(event(0)));render(true,false);
 expect(scroll).not.toHaveBeenCalled();expect(memory.read(origin)!.offset).toBe(0);
});
it("preserves an initial unread restore target when access is lost before measurements arrive",()=>{
 const memory=createInboxBrowseMemory(origin);memory.scroll(origin,500);const{render,scroll}=mount(memory,500);render(true);render(false,true);
 act(()=>{bindings.onScroll(event(0));bindings.onLayout({nativeEvent:{layout:{height:300}}});bindings.onContentSizeChange(320,2000);});expect(scroll).not.toHaveBeenCalled();render(true,false);expect(scroll).toHaveBeenLastCalledWith({offset:500,animated:false});
});

it("ignores zero scroll, drag, cancel and measurement events after the list owner unmounts",()=>{
 const memory=createInboxBrowseMemory(origin);const{render,scroll}=mount(memory,0);render(true);
 act(()=>{bindings.onLayout({nativeEvent:{layout:{height:300}}});bindings.onContentSizeChange(320,3000);bindings.onScroll(event(1000));});const retired={...bindings};const calls=scroll.mock.calls.length;
 act(()=>root!.unmount());root=undefined;act(()=>{retired.onScroll(event(0));retired.onScrollBeginDrag(event(0));retired.cancelRestore();retired.onContentSizeChange(320,100);retired.onLayout({nativeEvent:{layout:{height:100}}});retired.onViewableItemsChanged({viewableItems:[]});});
 expect(memory.read(origin)!.offset).toBe(1000);expect(scroll.mock.calls).toHaveLength(calls);
});

it("rejects delayed concealed-window events after the visible list has already restored",()=>{
 const memory=createInboxBrowseMemory(origin);const{render,scroll}=mount(memory,0);render(true);
 act(()=>{bindings.onLayout({nativeEvent:{layout:{height:300}}});bindings.onContentSizeChange(320,3000);bindings.onScroll(event(1000));});
 const before={...bindings};render(false,true);const concealed={...bindings};act(()=>concealed.onScroll(event(0)));render(true,false);
 act(()=>{bindings.onContentSizeChange(320,3000);bindings.onScroll(event(1000));});const calls=scroll.mock.calls.length;
 act(()=>{before.onScroll(event(0));concealed.onScroll(event(0));concealed.onScrollBeginDrag(event(0));concealed.cancelRestore();concealed.onContentSizeChange(320,100);});expect(memory.read(origin)!.offset).toBe(1000);expect(scroll.mock.calls).toHaveLength(calls);
});

it("does not finish restoration from the pre-concealment offset before the native zero event arrives",()=>{
 const memory=createInboxBrowseMemory(origin);const{render,scroll}=mount(memory,0);render(true);
 act(()=>{bindings.onLayout({nativeEvent:{layout:{height:508}}});bindings.onContentSizeChange(320,3400);bindings.onScroll(event(1000));});
 render(false,true);act(()=>{bindings.onContentSizeChange(320,508);bindings.onScroll(event(1000));});
 render(true,false);act(()=>bindings.onScroll(event(0)));
 expect(memory.read(origin)!.offset).toBe(1000);
 act(()=>{bindings.onContentSizeChange(320,3400);bindings.onScroll(event(1000));});
 expect(scroll).toHaveBeenLastCalledWith({offset:1000,animated:false});expect(memory.read(origin)!.offset).toBe(1000);
 act(()=>bindings.onScroll(event(1100)));expect(memory.read(origin)!.offset).toBe(1100);
});

it("does not clamp a restored end position using last-row visibility from the previous list instance",()=>{
 const memory=createInboxBrowseMemory(origin);const{render,scroll}=mount(memory,0);render(true);
 act(()=>{bindings.onLayout({nativeEvent:{layout:{height:300}}});bindings.onContentSizeChange(320,1400);bindings.onScroll(event(1100));bindings.onViewableItemsChanged({viewableItems:[{index:79,isViewable:true}]});});
 render(false,true);act(()=>bindings.onViewableItemsChanged({viewableItems:[{index:79,isViewable:true}]}));render(true,false);
 act(()=>{bindings.onContentSizeChange(320,500);bindings.onScroll(event(200));});expect(memory.read(origin)!.offset).toBe(1100);
 act(()=>{bindings.onContentSizeChange(320,1400);bindings.onScroll(event(1100));});expect(scroll).toHaveBeenLastCalledWith({offset:1100,animated:false});expect(memory.read(origin)!.offset).toBe(1100);
});
