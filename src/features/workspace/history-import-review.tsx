import { ActionReviewSheet } from "@/ui/action-review-sheet";
import { providerName } from "./provider-choices";
import { Body, Notice, ScreenList, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { formatAttachmentSize } from "./attachment-presentation";
import type { HistoryCandidate } from "./history-import-model";

export function HistoryImportReview({ targetLabel, projectId, sessionId, candidates, onClose, onConfirm }: {
  targetLabel: string; projectId: string; sessionId: string; candidates: HistoryCandidate[];
  onClose: () => void; onConfirm: () => void;
}) {
  const copy = useCopy(), locale = useLocale();
  return <ActionReviewSheet title={copy("Geçmişi içe aktar", "Import history")} submitLabel={copy("İçe aktar", "Import")} scroll={false} onClose={onClose} onConfirm={onConfirm}>
    <ScreenList data={candidates} keyExtractor={candidate => candidate.id} header={<Stack>
      <Body selectable>{targetLabel}</Body>
      <Notice message={copy("Seçilen oturumlar bilgisayardaki mevcut oturum deposuna eklenir. Provider çalıştırılmaz.", "Selected sessions are added to the computer's existing session store. No provider is started.")} />
      <Body>{copy("Seçilen oturumlar: {p0}", "Selected sessions: {p0}", { p0: candidates.length })}</Body>
      <Body mono muted selectable>{projectId}</Body><Body mono muted selectable>{sessionId}</Body>
    </Stack>} renderItem={({ item }) => <Stack>
      <Body selectable>{item.prompt || providerName(item.provider)}</Body>
      <Body muted>{providerName(item.provider)} · {item.kind} · {formatAttachmentSize(item.sizeBytes, locale)}{!item.resumable ? ` · ${copy("Salt okunur", "Read-only")}` : ""}</Body>
      <Body muted>{new Date(item.startedAt).toLocaleString(locale)} → {new Date(item.lastAt).toLocaleString(locale)}</Body>
    </Stack>} />
  </ActionReviewSheet>;
}
