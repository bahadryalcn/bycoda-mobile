import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import Pencil from "lucide-react-native/icons/pencil";
import { useConnectionScope } from "@/state/connection-scope";
import { useMachines } from "@/state/machines";
import { ActionMenu, Body, Disclosure, Empty, ErrorText, Input, Loading, FormActions, Notice, Sheet, Stack } from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { CollectionToolbar } from "@/ui/search-field";
import { PrivateContentAccessProvider,usePrivateContentAccess } from "@/ui/private-access";
import { ChatToolbarAction } from "@/ui/chat-controls";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { QueueEditReview } from "./queue-edit-review";
import type { SessionScope } from "./session-types";
import type { useQueueEditor } from "./session-queue-editor";
import { composerDeliveryError } from "./composer-delivery-copy";
import { RecordAccessUnavailable } from "./unavailable-state";

/** Presentation keeps no draft copy; the original persistent editor remains its owner. */
export function SessionQueueEditor({editor,blocked,scope}:{editor:ReturnType<typeof useQueueEditor>;blocked:boolean;scope:SessionScope}){
  const { colors } = useMobileTheme();
  const copy=useCopy(),{height}=useWindowDimensions(),connection=useConnectionScope(),access=usePrivateContentAccess();
  const machine=useMachines(state=>state.machines.find(entry=>entry.id===scope.machineId));
  const [opening]=useState(()=>({connection,scope:{...scope},name:machine?.name??machine?.id??""}));
  const mounted=useRef(false);
  useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const available=connection===opening.connection&&opening.connection.isCurrent()&&useMachines.getState().activeId===opening.scope.machineId&&scope.machineId===opening.scope.machineId&&scope.sessionId===opening.scope.sessionId&&access.allowed&&access.check();
  const live=useRef({editor,blocked,access,available});live.current={editor,blocked,access,available};
  const origin=()=>mounted.current&&live.current.available&&opening.connection.isCurrent()&&useMachines.getState().activeId===opening.scope.machineId&&live.current.access.allowed&&live.current.access.check();
  const edit=editor.value;
  const window=useMemo(()=>({active:false}),[editor.visible,available,edit?.original]);
  useLayoutEffect(()=>{window.active=true;return()=>{window.active=false;};},[window]);
  const current=()=>origin()&&window.active&&live.current.editor.visible;
  const disabled=blocked||editor.working||!editor.ready;
  const lease=useMemo(()=>({active:false}),[editor.visible,available,edit,disabled]);
  useLayoutEffect(()=>{lease.active=true;return()=>{lease.active=false;};},[lease]);
  type Approval={kind:"reload"|"discard";edit:NonNullable<typeof edit>;lease:typeof lease};
  const [approval,setApproval]=useState<Approval>(),issued=useRef<Approval|undefined>(undefined);
  const [needsResume,setNeedsResume]=useState(false);
  useLayoutEffect(()=>{if(!editor.visible)setNeedsResume(false);},[editor.visible]);
  useLayoutEffect(()=>{if(issued.current&&issued.current.lease!==lease){issued.current=undefined;setApproval(undefined);}},[lease]);
  useLayoutEffect(()=>()=>{issued.current=undefined;},[]);
  const close=()=>{if(!mounted.current||!window.active||!live.current.editor.visible||live.current.editor.working)return;issued.current=undefined;setApproval(undefined);live.current.editor.hide();};
  const openReview=(kind:"reload"|"discard")=>{if(!current()||!lease.active||disabled||!edit||issued.current||editor.valueRef.current!==edit)return;const value={kind,edit,lease};issued.current=value;setApproval(value);};
  const cancelReview=()=>{if(approval&&issued.current===approval){issued.current=undefined;setApproval(undefined);}};
  const confirm=()=>{
    if(!approval||issued.current!==approval||approval.lease!==lease||!lease.active||!current()||disabled||live.current.editor.valueRef.current!==approval.edit)return;
    issued.current=undefined;setApproval(undefined);if(approval.kind==="reload"){setNeedsResume(false);live.current.editor.reload();}else live.current.editor.discard();
  };
  const change=(text:string)=>{if(!current()||live.current.blocked||live.current.editor.working||!live.current.editor.ready||!edit||live.current.editor.valueRef.current?.original!==edit.original)return;live.current.editor.setValue(value=>value&&value.original===edit.original?{...value,text}:value);};
  const save=()=>{if(current()&&lease.active&&!disabled&&!needsResume&&!issued.current&&edit&&live.current.editor.valueRef.current?.original===edit.original)live.current.editor.save();};
  const [retrying,setRetrying]=useState(false),retryRef=useRef(false);
  const retry=async()=>{if(!current()||retryRef.current||live.current.editor.working)return;retryRef.current=true;setRetrying(true);setNeedsResume(true);try{await live.current.editor.load();}finally{retryRef.current=false;if(mounted.current)setRetrying(false);}};
  const resume=()=>{if(current()&&!disabled&&!issued.current&&live.current.editor.valueRef.current){setNeedsResume(false);live.current.editor.open();}};
  const feedback=<ErrorText error={editor.error||editor.editError} message={composerDeliveryError(editor.error||editor.editError,copy)}/>;
  return <>
    {edit||editor.error?<ChatToolbarAction label={copy("Sıradaki mesajın taslağı", "Queued message draft")} onPress={()=>{if(origin())live.current.editor.open();}} disabled={!available}><Pencil size={14} color={colors.muted}/></ChatToolbarAction>:null}
    <Sheet visible={editor.visible} title={copy("Sıradaki mesajı düzenle", "Edit queued message")} dismissible={!editor.working} dirty={!!edit && edit.text !== edit.original.text} onClose={close} size="form" scroll={false}>
      <ScreenList data={available&&edit?edit.original.attachments:[]} keyExtractor={file=>file.id} header={<Stack>
        {available?<>
          <CollectionToolbar field={<Body selectable>{opening.name}</Body>} actions={edit?<ActionMenu label={copy("Diğer işlemler", "More actions")} actions={[
            {key:"reload",label:copy("Sıradaki güncel mesajı yükle", "Reload latest queued message"),disabled:disabled||!!approval,onPress:()=>openReview("reload")},
            {key:"discard",label:copy("Düzenlemeyi sil", "Discard edit"),destructive:true,disabled:disabled||!!approval,onPress:()=>openReview("discard")},
          ]}/>:undefined}/>
          {!editor.ready&&!editor.error?<Loading/>:null}
          {edit?<>
            {edit.original.modelTarget?<Body muted selectable>{edit.original.modelTarget.model}</Body>:null}
            <Input label={copy("Mesaj", "Message")} value={edit.text} multiline style={{minHeight:Math.max(120,Math.min(240,height*.28))}} editable={!disabled&&!approval} onChangeText={change}/>
            <Disclosure label={copy("Ayrıntılar", "Details")}>
              <Notice message={copy("Ekler ve özgün model ayarları korunur.", "Attachments and original model settings are preserved.")}/>
              <Body mono selectable>{edit.original.id}</Body>
              {edit.original.modelTarget?<><Body mono selectable>{edit.original.modelTarget.harness}</Body>{Object.entries(edit.original.modelTarget.modelSettings).map(([key,value])=><Body key={key} mono selectable>{key}: {String(value)}</Body>)}</>:null}
            </Disclosure>
          </>:editor.ready&&!editor.error?<Empty compact title={copy("Sıradaki mesaja ait taslak yok.", "No queued message draft.")}/>:null}
        </>:<RecordAccessUnavailable />}
      </Stack>} renderItem={({item:file})=><Body muted selectable>{file.name} · {Math.ceil(file.size/1024)} KB</Body>}/>
      {available&&editor.error&&!editor.ready?<FormActions submitLabel={copy("Taslağı yeniden yükle", "Retry loading draft")} onSubmit={()=>{void retry();}} busy={retrying} disabled={editor.working} feedback={feedback} onCancel={!retrying?close:undefined} cancelLabel={copy("Kapat", "Close")}/>:
        available&&edit&&editor.ready?<FormActions submitLabel={needsResume?copy("Düzenlemeye devam et", "Continue editing"):copy("Değişiklikleri kaydet", "Save changes")} onSubmit={needsResume?resume:save} busy={editor.working} disabled={blocked||!!approval} feedback={feedback} onCancel={close} cancelLabel={copy("Kapat", "Close")}/>:
          <FormActions submitLabel={copy("Kapat", "Close")} onSubmit={close} disabled={editor.working} feedback={available?feedback:undefined}/>}
    </Sheet>
    <PrivateContentAccessProvider value={{allowed:available,check:current}}>
      {approval&&approval.lease===lease&&available&&editor.visible&&!disabled?<QueueEditReview kind={approval.kind} edit={approval.edit} machineName={opening.name} onClose={cancelReview} onConfirm={confirm}/>:null}
    </PrivateContentAccessProvider>
  </>;
}
