import {useState,type ReactNode} from "react";
import {View,useWindowDimensions} from "react-native";
import {fontSize,space} from "./tokens";
import {hierarchyLayout} from "./hierarchy-layout";

/** Measure the actual cell, including embedded lists; never infer it from device width. */
export function HierarchyFrame({depth,reservedWidth,typeSize=fontSize.title,children}:{
  depth:number; reservedWidth:number; typeSize?:number;
  children(layout:ReturnType<typeof hierarchyLayout>):ReactNode;
}) {
  const [width,setWidth]=useState(0);
  const {fontScale}=useWindowDimensions();
  const layout=hierarchyLayout({width,depth,step:space.md,reservedWidth,typeSize:typeSize*Math.max(1,fontScale)});
  return <View style={{alignSelf:"stretch",minWidth:0,maxWidth:"100%"}} onLayout={event=>{
    const next=event.nativeEvent.layout.width;
    if(Number.isFinite(next)&&next>0)setWidth(previous=>Math.abs(previous-next)<0.5?previous:next);
  }}>{children(layout)}</View>;
}
