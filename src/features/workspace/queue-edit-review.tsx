import { ActionReviewSheet } from "@/ui/action-review-sheet";
import { Body, Notice, Stack } from "@/ui/primitives";
import { ScreenList } from "@/ui/screen-list";
import { useCopy } from "@/ui/copy";
import type { useQueueEditor } from "./session-queue-editor";

export function QueueEditReview({kind,edit,machineName,onClose,onConfirm}:{kind:"reload"|"discard";edit:NonNullable<ReturnType<typeof useQueueEditor>["value"]>;machineName:string;onClose:()=>void;onConfirm:()=>void}){
  const copy=useCopy();
  return <ActionReviewSheet title={kind==="reload"?copy("Sıradaki güncel mesajı yükle", "Reload latest queued message"):copy("Düzenlemeyi sil", "Discard edit")} submitLabel={kind==="reload"?copy("Güncel mesajı yükle", "Load latest message"):copy("Düzenlemeyi sil", "Discard edit")} tone={kind==="discard"?"danger":"primary"} scroll={false} onClose={onClose} onConfirm={onConfirm}>
    <ScreenList data={edit.original.attachments} keyExtractor={file=>file.id} header={<Stack><Body selectable>{machineName}</Body><Body mono selectable>{edit.original.id}</Body><Body muted>{edit.original.modelTarget?.model}</Body>
      <Notice tone={kind==="discard"?"warning":"info"} message={kind==="reload"?copy("Bu düzenlemeyi bilgisayardaki güncel mesajla değiştir?", "Replace this edit with the latest message on your computer?"):copy("Bu düzenlemeyi sil? Sıradaki özgün mesaj korunur.", "Discard this edit? The original queued message is kept.")}/>
      <Body selectable>{edit.text}</Body>
    </Stack>} renderItem={({item:file})=><Body muted selectable>{file.name} · {Math.ceil(file.size/1024)} KB</Body>}/>
  </ActionReviewSheet>;
}
