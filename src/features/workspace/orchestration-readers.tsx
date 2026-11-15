import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { providerName } from "./provider-choices";
import type { Block } from "@/domain/types";
import { Body, FormActions, NavigationRow, Notice, Sheet, Stack } from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { MessageText } from "@/ui/message-text";
import { useCopy } from "@/ui/copy";
import { usePrivateContentAccess } from "@/ui/private-access";
import type { MessageContext } from "@/ui/media-policy";

export type CoordinationProposal = NonNullable<Block["orchestration"]>;
export type CoordinationTask = CoordinationProposal["tasks"][number];
export type CoordinationReader = { kind:"request"|"summary"|"details"|"help" } | {kind:"task";task:CoordinationTask};

/** Full immutable presentation only. There is no native controller or command port. */
export function OrchestrationReader({value,proposal,context,onClose,onDependency}:{
  value:CoordinationReader;proposal:CoordinationProposal;context?:MessageContext;onClose:()=>void;onDependency:(id:string)=>void;
}) {
  const copy=useCopy();
  if(value.kind==="task")return <TaskReader key={value.task.id} task={value.task} proposal={proposal} context={context} onClose={onClose} onDependency={onDependency}/>;
  const title=value.kind==="request"?copy("İstek", "Request"):value.kind==="summary"?copy("Özet", "Summary"):value.kind==="details"?copy("Ayrıntılar", "Details"):copy("Yardım", "Help");
  return <Sheet visible title={title} size="form" scroll={value.kind!=="details"} onClose={onClose}>
    {value.kind==="request"||value.kind==="summary"?<MessageText text={value.kind==="request"?proposal.request:proposal.summary} context={context} compactMedia/>:value.kind==="help"?
      <Notice message={copy("Bu koordinasyonun eylemlerini bilgisayardan yönet.", "Manage this coordination's actions on your computer.")}/>:
      <ScreenList data={proposal.settings.choices} keyExtractor={(choice,index)=>`${index}:${choice.harness}:${choice.model}`} header={<Stack>
        <Body muted>{copy("Ana oturum", "Parent session")}</Body><Body mono selectable>{proposal.leadId}</Body>
        <Body mono selectable>{proposal.cwd}</Body>{proposal.checkoutCwd&&proposal.checkoutCwd!==proposal.cwd?<Body mono selectable>{proposal.checkoutCwd}</Body>:null}
        <Body selectable>{providerName(proposal.author.harness)} · {proposal.author.model}</Body>
        <Body>{copy("Eşzamanlı çalışan sınırı: {p0}", "Concurrent worker limit: {p0}", {p0:proposal.settings.maxWorkers})}</Body>
      </Stack>} renderItem={({item})=><Stack><Body selectable>{item.name}</Body><Body mono selectable>{providerName(item.harness)} · {item.model}</Body></Stack>}/>}
    <FormActions submitLabel={copy("Kapat", "Close")} onSubmit={onClose}/>
  </Sheet>;
}

function TaskReader({task,proposal,context,onClose,onDependency}:{task:CoordinationTask;proposal:CoordinationProposal;context?:MessageContext;onClose:()=>void;onDependency:(id:string)=>void;}){
  const copy=useCopy(),access=usePrivateContentAccess(),mounted=useRef(false);
  useLayoutEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [prompt,setPrompt]=useState(false);
  const promptLease=useMemo(()=>({active:false}),[prompt]);
  useLayoutEffect(()=>{promptLease.active=true;return()=>{promptLease.active=false;};},[promptLease]);
  const current=()=>mounted.current&&access.allowed&&access.check();
  const titles=new Map(proposal.tasks.map(entry=>[entry.id,entry.title]));
  type Entry={kind:"heading";key:string;label:string}|{kind:"file";key:string;value:string}|{kind:"dependency";key:string;value:string}|{kind:"setting";key:string;value:string};
  const rows:Entry[]=[
    ...(task.files.length?[{kind:"heading" as const,key:"files",label:copy("Dosya kapsamı", "File scope")},...task.files.map((value,index)=>({kind:"file" as const,key:`file:${index}`,value}))]:[]),
    ...(task.dependsOn.length?[{kind:"heading" as const,key:"dependencies",label:copy("Bağımlılıklar", "Dependencies")},...task.dependsOn.map((value,index)=>({kind:"dependency" as const,key:`dependency:${index}`,value}))]:[]),
    ...(Object.keys(task.modelSettings??{}).length?[{kind:"heading" as const,key:"settings",label:copy("Model ayarları", "Model settings")},...Object.entries(task.modelSettings!).map(([key,value])=>({kind:"setting" as const,key:`setting:${key}`,value:`${key}: ${value}`}))]:[]),
  ];
  return <><Sheet visible title={copy("Görev ayrıntıları", "Task details")} size="form" scroll={false} onClose={onClose}>
    <ScreenList data={rows} keyExtractor={item=>item.key} header={<Stack><Body selectable>{task.title}</Body><Body mono selectable>{task.id}</Body><Body muted>{providerName(task.harness)} · {task.model}</Body>
      <NavigationRow label={copy("Görev", "Assignment")} onPress={()=>{if(current()&&promptLease.active)setPrompt(true);}}/>
    </Stack>} renderItem={({item})=>item.kind==="heading"?<Body muted>{item.label}</Body>:item.kind==="dependency"&&titles.has(item.value)?
      <NavigationRow label={titles.get(item.value)!} detail={item.value} onPress={()=>{if(current())onDependency(item.value);}}/>:
      <Body mono selectable>{item.value}</Body>}/>
    <FormActions submitLabel={copy("Kapat", "Close")} onSubmit={onClose}/>
  </Sheet>{prompt?<Sheet visible title={copy("Görev", "Assignment")} size="form" onClose={()=>{if(current()&&promptLease.active)setPrompt(false);}}>
    <MessageText text={task.prompt} context={context} compactMedia/><FormActions submitLabel={copy("Kapat", "Close")} onSubmit={()=>{if(current()&&promptLease.active)setPrompt(false);}}/>
  </Sheet>:null}</>;
}
