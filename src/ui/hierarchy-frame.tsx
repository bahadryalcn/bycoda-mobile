import {createContext,useContext,useRef,useState,type ReactNode} from "react";
import {View,useWindowDimensions} from "react-native";
import {fontSize,space} from "./tokens";
import {hierarchyLayout} from "./hierarchy-layout";

type WidthStore={current:number};
const SharedWidth=createContext<WidthStore|null>(null);

/**
 * Wrap a list of rows: the first measured row cell shares its width, so later rows lay out
 * at the right indent on their first render instead of mounting at 0 and re-rendering.
 * Each row still measures itself, so rotation or a narrower cell corrects the shared value.
 */
export function HierarchyWidthProvider({children}:{children:ReactNode}){
  const store=useRef<WidthStore>({current:0});
  return <SharedWidth.Provider value={store.current}>{children}</SharedWidth.Provider>;
}

/** Measure the actual cell, including embedded lists; never infer it from device width. */
export function HierarchyFrame({depth,reservedWidth,typeSize=fontSize.title,children}:{
  depth:number; reservedWidth:number; typeSize?:number;
  children(layout:ReturnType<typeof hierarchyLayout>):ReactNode;
}) {
  const shared=useContext(SharedWidth);
  const [width,setWidth]=useState(()=>shared?.current??0);
  const {fontScale}=useWindowDimensions();
  const layout=hierarchyLayout({width,depth,step:space.md,reservedWidth,typeSize:typeSize*Math.max(1,fontScale)});
  return <View style={{alignSelf:"stretch",minWidth:0,maxWidth:"100%"}} onLayout={event=>{
    const next=event.nativeEvent.layout.width;
    if(!Number.isFinite(next)||next<=0)return;
    if(shared)shared.current=next;
    setWidth(previous=>Math.abs(previous-next)<0.5?previous:next);
  }}>{children(layout)}</View>;
}
