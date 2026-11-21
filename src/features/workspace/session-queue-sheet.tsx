import { sessionModelLabel } from "./catalog";
import { createElement, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { View } from "react-native";
import type { QueuedMessage } from "../../../../src/features/sessions/model/session";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import Pause from "lucide-react-native/icons/pause";
import Play from "lucide-react-native/icons/play";
import Pencil from "lucide-react-native/icons/pencil";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import ArrowDown from "lucide-react-native/icons/arrow-down";
import Trash2 from "lucide-react-native/icons/trash-2";
import CheckCheck from "lucide-react-native/icons/check-check";
import RotateCw from "lucide-react-native/icons/rotate-cw";
import { useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { ActionMenu, Badge, Body, Empty, ErrorText, FormActions, NavigationRow, Notice, Row, Sheet, Stack } from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { CollectionToolbar } from "@/ui/search-field";
import { PrivateContentAccessProvider, usePrivateContentAccess } from "@/ui/private-access";
import { useListScrollMemory } from "@/ui/use-list-scroll-memory";
import { useCopy } from "@/ui/copy";
import type { SessionScope } from "./session-types";
import { useMobileTheme } from "@/ui/theme";
import { RecordAccessUnavailable } from "./unavailable-state";
import type { QueueDeliveryReview } from "./queue-delivery";

export type QueueSheetState={rows:readonly QueuedMessage[];label:string;error:unknown;errorMessage?:string;warning?:string;disabled:boolean;sending:boolean;controlling:boolean;reloadBusy:boolean;queueError:boolean;active:boolean;canEdit:boolean;hasDraft:boolean;disableSend:boolean;disableControl:boolean;
  /** The row the Host is sending now. */
  sendingId?:string;
  /** Why Send again cannot be chosen for an unconfirmed row (the provider may still answer). */
  retryBlocked?:string;};
export type QueueSheetActions={close():void;reload():void;resume():void;send():void;control():void;edit(row:QueuedMessage):void;move(id:string,delta:-1|1):void;remove(id:string):void;
  /** The owner settles an unconfirmed row; nothing is resent without this choice. */
  review(id:string,outcome:QueueDeliveryReview):void;};

/** Presentation and local reading only; queue/editor owners retain every write. */
export function SessionQueueSheet({scope,visible,state,actions}:{scope:SessionScope;visible:boolean;state:QueueSheetState;actions:QueueSheetActions}){
  const { uiStyles, colors } = useMobileTheme();
  const glyph=(Icon:ComponentType<{size:number;color:string}>,danger?:boolean)=>createElement(Icon,{size:18,color:danger?colors.danger:colors.muted});
  const copy=useCopy(),connection=useConnectionScope(),access=usePrivateContentAccess();
  const machine=useMachines(store=>store.machines.find(entry=>entry.id===scope.machineId));
  const [opening]=useState(()=>({scope:{...scope},connection,name:machine?.name??machine?.id??""}));
  const mounted=useRef(false);
  useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const available=connection===opening.connection&&opening.connection.isCurrent()&&scope.machineId===opening.scope.machineId&&scope.sessionId===opening.scope.sessionId&&useMachines.getState().activeId===opening.scope.machineId&&access.allowed&&access.check();
  const privateFailure=["auth","identity"].includes((state.error as {kind?:string}|null)?.kind??"");
  const readable=available&&!privateFailure;
  const live=useRef({visible,available,access,state,actions});live.current={visible,available,access,state,actions};
  const lease=useMemo(()=>({active:false}),[visible,readable]);
  useLayoutEffect(()=>{lease.active=true;return()=>{lease.active=false;};},[lease]);
  const origin=()=>mounted.current&&live.current.visible&&live.current.available&&opening.connection.isCurrent()&&useMachines.getState().activeId===opening.scope.machineId&&live.current.access.allowed&&live.current.access.check();
  const current=()=>readable&&lease.active&&origin();
  const position=useRef(0),memory=useMemo(()=>({scroll:(offset:number)=>{position.current=offset;}}),[]);
  const scroll=useListScrollMemory<QueuedMessage>(memory,position.current,visible&&readable,state.rows.length,{suspended:!visible||!readable});
  type Selection={row:QueuedMessage;lease:typeof lease};
  const [selection,setSelection]=useState<Selection>(),issued=useRef<Selection|undefined>(undefined);
  useLayoutEffect(()=>{if(issued.current&&(issued.current.lease!==lease||!state.rows.some(row=>row.id===issued.current!.row.id))){issued.current=undefined;setSelection(undefined);}},[lease,state.rows]);
  useLayoutEffect(()=>()=>{issued.current=undefined;},[]);
  const exists=(row:QueuedMessage)=>current()&&live.current.state.rows.includes(row);
  const writable=(row:QueuedMessage)=>exists(row)&&!live.current.state.disabled;
  const inspect=(row:QueuedMessage)=>{if(!exists(row)||issued.current)return;const next={row,lease};issued.current=next;setSelection(next);};
  const closeReader=()=>{if(mounted.current&&selection&&issued.current===selection){issued.current=undefined;setSelection(undefined);}};
  const review=(row:QueuedMessage,outcome:QueueDeliveryReview)=>{if(writable(row)&&row.deliveryUnknown&&!(outcome==="retry"&&live.current.state.retryBlocked))live.current.actions.review(row.id,outcome);};
  const edit=(row:QueuedMessage)=>{if(writable(row)&&!row.deliveryUnknown&&live.current.state.canEdit&&!live.current.state.queueError){closeReader();live.current.actions.edit(row);}};
  const reload=()=>{if(origin()&&!live.current.state.reloadBusy)live.current.actions.reload();};
  const close=()=>{if(mounted.current&&lease.active)live.current.actions.close();};
  const primary=!readable||state.queueError||!!state.warning?"reload":state.hasDraft?"resume":state.rows.length?"send":undefined;
  const submit=()=>{if(primary==="reload"){reload();return;}if(!current()||live.current.state.disabled)return;if(primary==="resume"&&live.current.state.hasDraft)live.current.actions.resume();else if(primary==="send"&&!live.current.state.disableSend)live.current.actions.send();};
  const feedback=<><ErrorText error={state.error} message={state.errorMessage}/>{state.warning&&state.warning!==state.errorMessage?<Notice tone="warning" message={state.warning}/>:null}</>;
  const selected=selection?state.rows.find(row=>row.id===selection.row.id):undefined;
  const canEditSelected=selected&&!selected.deliveryUnknown&&state.canEdit&&!state.queueError;
  return <><Sheet visible={visible} title={copy("Mesaj sırası", "Message queue")} size="form" scroll={false} onClose={close}>
    <ScreenList {...scroll.listProps} data={readable?state.rows:[]} keyExtractor={row=>row.id} header={<Stack>
      {readable?<CollectionToolbar field={<Stack><Body selectable>{opening.name}</Body><Body muted style={uiStyles.caption}>{state.label}</Body></Stack>} actions={<ActionMenu label={copy("Diğer işlemler", "More actions")} actions={[
        {key:"reload",icon:glyph(RefreshCw),label:copy("Sırayı yeniden yükle", "Reload queue"),disabled:state.reloadBusy,onPress:reload},
        !!state.rows.length&&{key:"control",icon:glyph(state.active?Pause:Play),label:state.active?copy("Sırayı duraklat", "Pause queue"):copy("Sırayı başlat", "Start queue"),disabled:state.disableControl||state.controlling,onPress:()=>{if(current()&&live.current.state.active===state.active&&!live.current.state.disableControl&&!live.current.state.controlling)live.current.actions.control();}},
        state.hasDraft&&{key:"resume",icon:glyph(Pencil),label:copy("Düzenlemeye devam et", "Continue editing"),disabled:state.disabled,onPress:()=>{if(current()&&!live.current.state.disabled&&live.current.state.hasDraft)live.current.actions.resume();}},
      ]}/>}/>:privateFailure?<ErrorText error={state.error}/>:<RecordAccessUnavailable />}
      {readable&&!state.rows.length?<Empty compact title={copy("Sıra boş", "Queue is empty")} detail={copy("Tur sürerken yazdığın mesajlar burada sırayla bekler ve sırayla gönderilir.", "Messages you queue while a turn runs wait here and are sent in order.")}/>:null}
      {readable&&!primary?feedback:null}
    </Stack>} renderItem={({item:row,index})=><Row style={{alignItems:"flex-start"}}>
      <View style={{flex:1,minWidth:0}}><NavigationRow label={row.text||copy("Ekli mesaj", "Message with attachments")} labelLines={2} detail={[index+1,sessionModelLabel(row.modelTarget)].filter(Boolean).join(" · ")} metadata={row.attachments.map(file=>file.name).join(" · ")} supporting={row.id===state.sendingId?<Badge tone="info" label={copy("Gönderiliyor…", "Sending…")}/>:row.deliveryUnknown?<Badge tone="warning" label={copy("Kontrol gerekiyor", "Needs review")}/>:undefined} onPress={()=>inspect(row)}/></View>
      <ActionMenu label={copy("Mesaj işlemleri", "Message actions")} actions={row.deliveryUnknown?[
        {key:"delivered",icon:glyph(CheckCheck),label:copy("Zaten iletildi", "Already delivered"),disabled:state.disabled,onPress:()=>review(row,"delivered")},
        {key:"retry",icon:glyph(RotateCw),label:copy("Yeniden gönder", "Send again"),detail:state.retryBlocked,disabled:state.disabled||!!state.retryBlocked,onPress:()=>review(row,"retry")},
        {key:"keep",icon:glyph(Pause),label:copy("Kuyrukta tut, duraklat", "Keep queued, pause"),disabled:state.disabled,onPress:()=>review(row,"keep")},
        {key:"discard",icon:glyph(Trash2,true),label:copy("Vazgeç", "Discard"),destructive:true,disabled:state.disabled,onPress:()=>review(row,"discard")},
      ]:[
        {key:"edit",icon:glyph(Pencil),label:copy("Sırayı duraklat ve düzenle", "Pause queue and edit"),disabled:state.disabled||!state.canEdit||state.queueError,onPress:()=>edit(row)},
        {key:"up",icon:glyph(ArrowUp),label:copy("Yukarı taşı", "Move up"),disabled:state.disabled||state.hasDraft||index===0,onPress:()=>{if(writable(row)&&!live.current.state.hasDraft&&live.current.state.rows.indexOf(row)>0)live.current.actions.move(row.id,-1);}},
        {key:"down",icon:glyph(ArrowDown),label:copy("Aşağı taşı", "Move down"),disabled:state.disabled||state.hasDraft||index===state.rows.length-1,onPress:()=>{if(writable(row)&&!live.current.state.hasDraft&&live.current.state.rows.indexOf(row)<live.current.state.rows.length-1)live.current.actions.move(row.id,1);}},
        {key:"remove",icon:glyph(Trash2,true),label:copy("Sıradan kaldır", "Remove from queue"),destructive:true,disabled:state.disabled||state.hasDraft,onPress:()=>{if(writable(row)&&!live.current.state.hasDraft)live.current.actions.remove(row.id);}},
      ]}/>
    </Row>}/>
    {primary?<FormActions submitLabel={primary==="reload"?copy("Sırayı yeniden yükle", "Reload queue"):primary==="resume"?copy("Düzenlemeye devam et", "Continue editing"):copy("Sonrakini gönder", "Send next")}
      onSubmit={submit} disabled={!available||(primary==="resume"&&state.disabled)||(primary==="send"&&state.disableSend)||(primary==="reload"&&state.reloadBusy)} busy={state.sending||state.controlling||primary==="reload"&&state.reloadBusy} feedback={readable?feedback:undefined}/>
    :null}
  </Sheet><PrivateContentAccessProvider value={{allowed:readable,check:current}}>
    {visible&&readable&&selection&&selection.lease===lease&&selected?<Sheet visible title={copy("Mesaj", "Message")} size="form" scroll={false} onClose={closeReader}>
      <ScreenList data={selected.attachments} keyExtractor={file=>file.id} header={<Stack><Body muted>{sessionModelLabel(selected.modelTarget)}</Body><Body selectable>{selected.text}</Body>
        {selected.deliveryUnknown&&state.warning?<Notice tone="warning" message={state.warning}/>:null}
        {selected.attachments.length?<Body muted>{copy("Dosyalar mesaj gönderildikten sonra açılabilir.", "Files can be opened after the queued message is sent.")}</Body>:null}
      </Stack>} renderItem={({item:file})=><Body muted selectable>{file.name} · {Math.ceil(file.size/1024)} KB</Body>}/>
      {canEditSelected?<FormActions submitLabel={copy("Sırayı duraklat ve düzenle", "Pause queue and edit")} onSubmit={()=>edit(selected)} disabled={state.disabled}/>:null}
    </Sheet>:null}
  </PrivateContentAccessProvider></>;
}
