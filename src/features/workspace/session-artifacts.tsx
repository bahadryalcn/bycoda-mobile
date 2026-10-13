import { useState } from "react";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { Body, Button, NavigationGroup, NavigationRow, QueryState, Sheet } from "@/ui/primitives";
import { DocumentPreview } from "@/ui/document-preview";
import { useCopy } from "@/ui/copy";
import type { HtmlArtifact, HtmlArtifactSummary } from "@/remote/types";

export function SessionArtifacts({ projectId, sessionId, messageId }: { projectId: string; sessionId: string; messageId?: string }) {
  const copy = useCopy(); const machine = useActiveMachine(); const [open, setOpen] = useState(false); const [selected, setSelected] = useState<HtmlArtifactSummary | null>(null);
  const supported = machine?.capabilities?.includes("html.artifacts") ?? false;
  const list = useHostQuery<HtmlArtifactSummary[]>(["artifacts", sessionId], "html.artifacts.list", { projectId, sessionId }, { enabled: supported });
  const detail = useHostQuery<HtmlArtifact>(["artifact", sessionId, selected?.id], "html.artifacts.read", { projectId, sessionId, id: selected?.id }, { enabled: !!selected });
  const items = messageId ? list.data?.filter((item) => item.messageId === messageId) : list.data;
  if (!supported || (messageId && !items?.length)) return null;
  return <><Button density="compact" tone="quiet" label={copy("Görseller ({p0})", "Artifacts ({p0})", { p0: items?.length ?? "…" })} onPress={() => setOpen(true)} />
    <Sheet visible={open} title={copy("Kaydedilen görseller", "Saved artifacts")} size="form" onClose={() => setOpen(false)}><QueryState query={list} />{list.error ? <Button label={copy("Yeniden dene", "Retry")} onPress={() => { void list.refetch(); }} /> : null}<NavigationGroup>{items?.map((item) => <NavigationRow key={item.id} label={item.title} detail={new Date(item.createdAt).toLocaleDateString()} onPress={() => setSelected(item)} />)}</NavigationGroup>{list.isSuccess && !items?.length ? <Body muted>{copy("Bu oturumda kaydedilmiş görsel yok.", "No saved artifacts in this session.")}</Body> : null}</Sheet>
    <Sheet visible={!!selected} title={selected?.title ?? ""} size="full" onClose={() => setSelected(null)}><QueryState query={detail} />{detail.error ? <Button label={copy("Yeniden dene", "Retry")} onPress={() => { void detail.refetch(); }} /> : null}{detail.data ? <DocumentPreview name={detail.data.title} text={detail.data.html} mimeType="text/html" /> : null}</Sheet>
  </>;
}
