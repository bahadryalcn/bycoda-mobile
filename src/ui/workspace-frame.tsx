import {useState,type PropsWithChildren,type ReactNode} from "react";
import {ScrollView,View,useWindowDimensions} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {metrics,space} from "./tokens";
import {workspaceHeaderMaximum} from "./workspace-frame-model";

/** Header and workspace each own a bounded region; feedback cannot erase the editor/list. */
export function WorkspaceFrame({toolbar,feedback,headerInset="screen",children}:PropsWithChildren<{toolbar:ReactNode;feedback?:ReactNode;headerInset?:"screen"|"none"}>) {
  const [height,setHeight]=useState(0);
  const {fontScale}=useWindowDimensions();
  const insets=useSafeAreaInsets();
  const maximum=workspaceHeaderMaximum(height,fontScale);
  return <View style={{flex:1,minHeight:0}} onLayout={event=>{
    const next=event.nativeEvent.layout.height;
    if(Number.isFinite(next)&&next>0)setHeight(previous=>previous===next?previous:next);
  }}>
    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="never"
      automaticallyAdjustKeyboardInsets={false} style={{flexGrow:0,flexShrink:0,maxHeight:maximum}}
      contentContainerStyle={{width:"100%",maxWidth:metrics.contentWidth,alignSelf:"center",paddingStart:headerInset==="none"?0:Math.max(space.screen,insets.left),paddingEnd:headerInset==="none"?0:Math.max(space.screen,insets.right),paddingTop:headerInset==="none"?0:space.xs,paddingBottom:headerInset==="none"?0:space.sm,gap:space.xs}}>
      <View style={{gap:space.xs}}>{toolbar}</View>
      {feedback}
    </ScrollView>
    <View style={{flex:1,minHeight:0}}>{children}</View>
  </View>;
}
