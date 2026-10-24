import { useState } from "react";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { Body, Button, NavigationRow, QueryState, ScreenList, Sheet } from "@/ui/primitives";
import { DocumentPreview } from "@/ui/document-preview";
import { useCopy } from "@/ui/copy";
import type { HtmlArtifact, HtmlArtifactSummary } from "@/remote/types";
import { readArtifact, readArtifactList } from "./artifact-model";

export function SessionArtifacts({ projectId, sessionId, messageId }: { projectId: string; sessionId: string; messageId?: string }) {
  const machine = useActiveMachine();
  return <ArtifactScope key={JSON.stringify([machine?.id, projectId, sessionId, messageId])} projectId={projectId} sessionId={sessionId} messageId={messageId} />;
}

function ArtifactScope({ projectId, sessionId, messageId }: { projectId: string; sessionId: string; messageId?: string }) {
  const copy = useCopy(); const machine = useActiveMachine(); const [open, setOpen] = useState(false); const [selected, setSelected] = useState<HtmlArtifactSummary | null>(null);
  const supported = machine?.capabilities?.includes("html.artifacts") ?? false;
  const list = useHostQuery<HtmlArtifactSummary[]>(["artifacts", projectId, sessionId], "html.artifacts.list", { projectId, sessionId }, {
    enabled: supported && (open || !!messageId),
    queryFn: async (client, signal) => readArtifactList(await client.request<unknown>("html.artifacts.list", { projectId, sessionId }, { signal }), sessionId),
  });
  const detail = useHostQuery<HtmlArtifact>(["artifact", projectId, sessionId, selected?.id], "html.artifacts.read", { projectId, sessionId, id: selected?.id }, {
    enabled: supported && open && !!selected,
    queryFn: async (client, signal) => readArtifact(await client.request<unknown>("html.artifacts.read", { projectId, sessionId, id: selected!.id }, { signal }), sessionId, selected!.id),
  });
  const items = messageId ? list.data?.filter((item) => item.messageId === messageId) : list.data;
  if (messageId && (!supported || !items?.length)) return null;
  return <><Button density="compact" tone="quiet" label={supported ? copy("Görseller ({p0})", "Artifacts ({p0})", { p0: items?.length ?? "…" }) : copy("Kaydedilen görseller", "Saved artifacts")} onPress={() => setOpen(true)} />
    <Sheet visible={open} title={copy("Kaydedilen görseller", "Saved artifacts")} size={supported ? "form" : "compact"} scroll={!supported} onClose={() => { setOpen(false); setSelected(null); }}>
      {supported ? <ScreenList data={items ?? []} keyExtractor={(item) => item.id}
        header={<QueryState query={list} />}
        renderItem={({ item }) => <NavigationRow label={item.title} detail={new Date(item.createdAt).toLocaleDateString()} onPress={() => setSelected(item)} />}
        ListEmptyComponent={list.isSuccess ? <Body muted>{copy("Bu oturumda kaydedilmiş görsel yok.", "No saved artifacts in this session.")}</Body> : null}
      /> : <Body muted>{copy("Bu bilgisayar kaydedilmiş HTML görsellerini paylaşmayı desteklemiyor. Çalışma alanına kaydedilen HTML dosyalarını Dosyalar’dan açabilirsin.", "This computer does not support sharing saved HTML artifacts. Open HTML files saved in the workspace from Files.")}</Body>}
    </Sheet>
    <Sheet visible={supported && open && !!selected} title={selected?.title ?? ""} size="full" onClose={() => setSelected(null)}><QueryState query={detail} />{supported && open && detail.data ? <DocumentPreview key={detail.data.id} name={detail.data.title} text={detail.data.html} mimeType="text/html" /> : null}</Sheet>
  </>;
}
