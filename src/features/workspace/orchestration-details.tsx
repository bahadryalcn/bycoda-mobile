import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Block } from "@/domain/types";
import { useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import type { SessionScope } from "./session-types";
import { ActionMenu, Badge, Body, FormActions, NavigationRow, Notice, Row, Stack, StateView } from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { CollectionToolbar } from "@/ui/search-field";
import { PrivateContentAccessProvider, usePrivateContentAccess } from "@/ui/private-access";
import { useSheetGuard } from "@/ui/sheet-guard";
import type { MessageContext } from "@/ui/media-policy";
import { useCopy } from "@/ui/copy";
import { OrchestrationReader, type CoordinationReader } from "./orchestration-readers";
import { RecordAccessUnavailable } from "./unavailable-state";
import { providerName } from "./provider-choices";

/** Read-only proposal projection. No controller or command port is exposed. */
export function OrchestrationDetails({block,scope,context,onClose}:{block:Block;scope:SessionScope;context?:MessageContext;onClose?:()=>void}){
  const copy=useCopy(),connection=useConnectionScope(),access=usePrivateContentAccess();
  const machine=useMachines(state=>state.machines.find(entry=>entry.id===scope.machineId));
  const proposal=block.orchestration;
  const [opening]=useState(()=>({connection,machineId:scope.machineId,sessionId:scope.sessionId,blockId:block.id,leadId:proposal?.leadId,cwd:proposal?.cwd,checkoutCwd:proposal?.checkoutCwd,machineName:machine?.name??machine?.id??""}));
  const mounted=useRef(false);
  useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const openingCurrent=connection===opening.connection&&opening.connection.isCurrent()&&useMachines.getState().activeId===opening.machineId&&scope.machineId===opening.machineId&&scope.sessionId===opening.sessionId&&block.id===opening.blockId;
  const openingReadable=openingCurrent&&access.allowed&&access.check();
  const readable=openingReadable&&!!proposal&&proposal.leadId===opening.leadId&&proposal.cwd===opening.cwd&&proposal.checkoutCwd===opening.checkoutCwd;
  const live=useRef({readable,access,proposal});live.current={readable,access,proposal};
  const lease=useMemo(()=>({active:false}),[readable]);
  useLayoutEffect(()=>{lease.active=true;return()=>{lease.active=false;};},[lease]);
  const current=()=>mounted.current&&lease.active&&live.current.readable&&opening.connection.isCurrent()&&useMachines.getState().activeId===opening.machineId&&live.current.access.allowed&&live.current.access.check();
  type Selection={value:CoordinationReader;lease:typeof lease;proposal:NonNullable<typeof proposal>;context:MessageContext|undefined};
  const [selection,setSelection]=useState<Selection>(),issued=useRef<Selection|undefined>(undefined);
  useLayoutEffect(()=>{if(issued.current&&issued.current.lease!==lease){issued.current=undefined;setSelection(undefined);}},[lease]);
  useLayoutEffect(()=>()=>{issued.current=undefined;},[]);
  const open=(value:CoordinationReader,from?:Selection)=>{
    if(!current()||issued.current&&issued.current!==from)return;
    const source=from?.proposal??live.current.proposal;
    if(!source || value.kind==="task"&&!source.tasks.includes(value.task))return;
    const next={value,lease,proposal:source,context:from?from.context:context?{...context}:undefined};issued.current=next;setSelection(next);
  };
  const closeReader=()=>{if(mounted.current&&selection&&issued.current===selection){issued.current=undefined;setSelection(undefined);}};
  const {requestClose}=useSheetGuard({onClose});
  const close=()=>{if(mounted.current&&lease.active)requestClose();};
  const statusLabel=proposal?({planning:copy("Planlanıyor", "Planning"),ready:copy("Hazır", "Ready"),invalid:copy("İnceleme gerekiyor", "Needs review"),starting:copy("Başlatılıyor", "Starting"),approved:copy("Onaylandı", "Approved")}[proposal.status]??proposal.status):undefined;
  return <><ScreenList data={readable&&proposal?proposal.tasks:[]} keyExtractor={task=>task.id}
    ListEmptyComponent={readable?<StateView compact title={copy("Bu görünümde görev yok", "No tasks in this view")}/>:undefined} header={<Stack>
    {readable&&proposal?<>
      <CollectionToolbar field={<Row><Body selectable style={{flexShrink:1}}>{opening.machineName}</Body>{statusLabel?<Badge label={statusLabel}/>:null}</Row>} actions={<ActionMenu label={copy("Diğer işlemler", "More actions")} actions={[{key:"details",label:copy("Ayrıntılar", "Details"),onPress:()=>open({kind:"details"})},{key:"help",label:copy("Yardım", "Help"),onPress:()=>open({kind:"help"})}]}/>}/>
      {proposal.leadId!==scope.sessionId?<Notice tone="warning" message={copy("Bu öneri başka bir ana oturuma ait.", "This proposal belongs to another parent session.")}/>:null}
      {proposal.error?<Notice tone="danger" message={proposal.error}/>:null}
      <NavigationRow label={copy("İstek", "Request")} onPress={()=>open({kind:"request"})}/>
      {proposal.summary?<NavigationRow label={copy("Özet", "Summary")} onPress={()=>open({kind:"summary"})}/>:null}
    </>:openingReadable&&!proposal?<StateView compact title={copy("Kullanılamıyor", "Unavailable")}/>:<RecordAccessUnavailable />}
  </Stack>} renderItem={({item:task})=><NavigationRow label={task.title} detail={`${providerName(task.harness)} · ${task.model}`} onPress={()=>open({kind:"task",task})}/>}/>
  {onClose?<FormActions submitLabel={copy("Kapat", "Close")} onSubmit={close}/>:null}
  <PrivateContentAccessProvider value={{allowed:readable,check:current}}>
    {selection&&selection.lease===lease&&readable?<OrchestrationReader value={selection.value} proposal={selection.proposal} context={selection.context} onClose={closeReader}
      onDependency={id=>{if(issued.current!==selection)return;const task=selection.proposal.tasks.find(entry=>entry.id===id);if(task)open({kind:"task",task},selection);}}/>:null}
  </PrivateContentAccessProvider></>;
}
