import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import Pencil from "lucide-react-native/icons/pencil";
import { useConnectionScope } from "@/state/connection-scope";
import { useMachines } from "@/state/machines";
import { ActionMenu, Button, Body, Empty, ErrorText, Input, Loading, FormActions, Sheet, Stack } from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { CollectionToolbar } from "@/ui/search-field";
import { PrivateContentAccessProvider,usePrivateContentAccess } from "@/ui/private-access";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { QueueEditReview } from "./queue-edit-review";
import type { SessionScope } from "./session-types";
import type { useQueueEditor } from "./session-queue-editor";
import { composerDeliveryError } from "./composer-delivery-copy";
import { RecordAccessUnavailable } from "./unavailable-state";
import { sessionModelLabel } from "./catalog";
import { useLocale } from "@/i18n";
import { ScopeLine } from "@/ui/scope-line";
import { formatAttachmentSize } from "./attachment-presentation";

/** Presentation keeps no draft copy; the original persistent editor remains its owner. */
export function SessionQueueEditor({editor,blocked,scope}:{editor:ReturnType<typeof useQueueEditor>;blocked:boolean;scope:SessionScope}){
  const { colors } = useMobileTheme();
  const copy=useCopy(),locale=useLocale(),{height}=useWindowDimensions(),connection=useConnectionScope(),access=usePrivateContentAccess();
  const machine=useMachines(state=>state.machines.find(entry=>entry.id===scope.machineId));
  const [opening]=useState(()=>({connection,scope:{...scope},name:machine?.name??copy("Bilgisayar", "Computer")}));
  const mounted=useRef(false);
  useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const available=connection===opening.connection&&opening.connection.isCurrent()&&useMachines.getState().activeId===opening.scope.machineId&&scope.machineId===opening.scope.machineId&&scope.sessionId===opening.scope.sessionId&&access.allowed&&access.check();
  const live=useRef({editor,blocked,access,available});live.current={editor,blocked,access,available};
  const origin=()=>mounted.current&&live.current.available&&opening.connection.isCurrent()&&useMachines.getState().activeId===opening.scope.machineId&&live.current.access.allowed&&live.current.access.check();
  const edit=editor.value;
  const target=edit?.original.modelTarget;
  const window=useMemo(()=>({active:false}),[editor.visible,available,edit?.original]);
  useLayoutEffect(()=>{window.active=true;return()=>{window.active=false;};},[window]);
  const current=()=>origin()&&window.active&&live.current.editor.visible;
  const disabled=blocked||editor.working||!editor.ready;
  const lease=useMemo(()=>({active:false}),[editor.visible,available,edit,disabled]);
  useLayoutEffect(()=>{lease.active=true;return()=>{lease.active=false;};},[lease]);
  type Approval={kind:"reload"|"discard";inline:boolean;edit:NonNullable<typeof edit>;lease:typeof lease};
  const [approval,setApproval]=useState<Approval>(),issued=useRef<Approval|undefined>(undefined);
  const [needsResume,setNeedsResume]=useState(false);
  useLayoutEffect(()=>{if(!editor.visible)setNeedsResume(false);},[editor.visible]);
  useLayoutEffect(()=>{if(issued.current&&issued.current.lease!==lease){issued.current=undefined;setApproval(undefined);}},[lease]);
  useLayoutEffect(()=>()=>{issued.current=undefined;},[]);
  const close=()=>{if(!mounted.current||!window.active||!live.current.editor.visible||live.current.editor.working)return;issued.current=undefined;setApproval(undefined);live.current.editor.hide();};
  const openReview=(kind:"reload"|"discard",inline=false)=>{if(!(inline?origin()&&window.active:current())||!lease.active||disabled||!edit||issued.current||editor.valueRef.current!==edit)return;const value={kind,inline,edit,lease};issued.current=value;setApproval(value);};
  const cancelReview=()=>{if(approval&&issued.current===approval){issued.current=undefined;setApproval(undefined);}};
  const confirm=()=>{
    if(!approval||issued.current!==approval||approval.lease!==lease||!lease.active||!(approval.inline?origin()&&window.active:current())||disabled||live.current.editor.valueRef.current!==approval.edit)return;
    issued.current=undefined;setApproval(undefined);if(approval.kind==="reload"){setNeedsResume(false);live.current.editor.reload();}else live.current.editor.discard();
  };
  const change=(text:string)=>{if(!current()||live.current.blocked||live.current.editor.working||!live.current.editor.ready||!edit||live.current.editor.valueRef.current?.original!==edit.original)return;live.current.editor.setValue(value=>value&&value.original===edit.original?{...value,text}:value);};
  const save=()=>{if(current()&&lease.active&&!disabled&&!needsResume&&!issued.current&&edit&&live.current.editor.valueRef.current?.original===edit.original)live.current.editor.save();};
  const [retrying,setRetrying]=useState(false),retryRef=useRef(false);
  const retry=async()=>{if(!current()||retryRef.current||live.current.editor.working)return;retryRef.current=true;setRetrying(true);setNeedsResume(true);try{await live.current.editor.load();}finally{retryRef.current=false;if(mounted.current)setRetrying(false);}};
  const resume=()=>{if(current()&&!disabled&&!issued.current&&live.current.editor.valueRef.current){setNeedsResume(false);live.current.editor.open();}};
  const feedback=<ErrorText error={editor.error||editor.editError} message={composerDeliveryError(editor.error||editor.editError,copy)}/>;
  const canRetry=available&&!!editor.error&&!editor.ready;
  const canSave=available&&!!edit&&editor.ready;
  return <>
    {edit||editor.error?<Button tone="quiet" style={{ minHeight: 48 }} label={edit?copy("Sıradaki mesaj düzenleniyor", "Editing queued message"):copy("Sıradaki mesajın taslağı", "Queued message draft")} onPress={()=>{if(origin())live.current.editor.open();}} disabled={!available}><Pencil size={14} color={colors.muted}/></Button>:null}
    {edit?<Button tone="quiet" style={{ minHeight: 48 }} label={copy("Düzenlemeyi iptal et", "Cancel editing")} busy={editor.working} disabled={!available||disabled||!!approval} onPress={()=>openReview("discard",true)}/>:null}
    {!editor.visible?<ErrorText error={editor.editError} message={composerDeliveryError(editor.editError,copy)}/>:null}
    <Sheet visible={editor.visible} title={copy("Sıradaki mesajı düzenle", "Edit queued message")} dismissible={!editor.working} dismissalRetryKey={editor.editError} onClose={close} size="form" scroll={false}>
      <ScreenList data={available&&edit?edit.original.attachments:[]} keyExtractor={file=>file.id} header={<Stack>
        {available?<>
          <CollectionToolbar field={<ScopeLine scope={{computer:opening.name}}/>} actions={edit?<ActionMenu label={copy("Diğer işlemler", "More actions")} actions={[
            {key:"reload",label:copy("Sıradaki güncel mesajı yükle", "Reload latest queued message"),disabled:disabled||!!approval,onPress:()=>openReview("reload")},
            {key:"discard",label:copy("Düzenlemeyi sil", "Discard edit"),destructive:true,disabled:disabled||!!approval,onPress:()=>openReview("discard")},
          ]}/>:undefined}/>
          {!editor.ready&&!editor.error?<Loading delayed/>:null}
          {edit?<>
            {target?<Body muted selectable>{sessionModelLabel(target)}</Body>:null}
            <Input label={copy("Mesaj", "Message")} value={edit.text} multiline style={{minHeight:Math.max(120,Math.min(240,height*.28))}} editable={!disabled&&!approval} onChangeText={change}/>
            <Body muted>{copy("Ekler ve özgün model ayarları korunur.", "Attachments and original model settings are preserved.")}</Body>
          </>:editor.ready&&!editor.error?<Empty compact title={copy("Sıradaki mesaja ait taslak yok.", "No queued message draft.")}/>:null}
          {!canRetry&&!canSave?feedback:null}
        </>:<RecordAccessUnavailable />}
      </Stack>} renderItem={({item:file})=><Body muted selectable>{file.name} · {formatAttachmentSize(file.size,locale)}</Body>}/>
      {canRetry?<FormActions submitLabel={copy("Taslağı yeniden yükle", "Retry loading draft")} onSubmit={()=>{void retry();}} busy={retrying} disabled={editor.working} feedback={feedback}/>:
        canSave?<FormActions submitLabel={needsResume?copy("Düzenlemeye devam et", "Continue editing"):copy("Değişiklikleri kaydet", "Save changes")} onSubmit={needsResume?resume:save} busy={editor.working} disabled={blocked||!!approval} dirty={!!edit && edit.text !== edit.original.text} feedback={feedback}/>:null}
    </Sheet>
    <PrivateContentAccessProvider value={{allowed:available,check:()=>approval?.inline?origin()&&window.active:current()}}>
      {approval&&approval.lease===lease&&available&&(approval.inline||editor.visible)&&!disabled?<QueueEditReview kind={approval.kind} edit={approval.edit} machineName={opening.name} onClose={cancelReview} onConfirm={confirm}/>:null}
    </PrivateContentAccessProvider>
  </>;
}
