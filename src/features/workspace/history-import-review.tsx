import { ActionReviewSheet } from "@/ui/action-review-sheet";
import { Body, Disclosure, Notice, ScreenList, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import type { HistoryCandidate } from "./history-import-model";

export function HistoryImportReview({ targetLabel, projectId, sessionId, candidates, onClose, onConfirm }: {
  targetLabel: string; projectId: string; sessionId: string; candidates: HistoryCandidate[];
  onClose: () => void; onConfirm: () => void;
}) {
  const copy = useCopy(), locale = useLocale();
  return <ActionReviewSheet title={copy("Geçmişi içe aktar", "Import history")} submitLabel={copy("İçe aktar", "Import")} scroll={false} onClose={onClose} onConfirm={onConfirm}>
    <ScreenList data={candidates} keyExtractor={candidate => candidate.id} header={<Stack>
      <Body selectable>{targetLabel}</Body>
      <Notice message={copy("Seçilen konuşmalar bilgisayardaki mevcut konuşma deposuna eklenir. Provider çalıştırılmaz.", "Selected conversations are added to the computer's existing conversation store. No provider is started.")} />
      <Body>{copy("Seçilen konuşmalar: {p0}", "Selected conversations: {p0}", { p0: candidates.length })}</Body>
      <Disclosure label={copy("Ayrıntılar", "Details")}><Body mono selectable>{projectId}</Body><Body mono selectable>{sessionId}</Body></Disclosure>
    </Stack>} renderItem={({ item }) => <Stack>
      <Body selectable>{item.prompt || item.provider}</Body>
      <Body muted>{item.provider} · {item.kind} · {item.sizeBytes} B{!item.resumable ? ` · ${copy("Salt okunur", "Read-only")}` : ""}</Body>
      <Body muted>{new Date(item.startedAt).toLocaleString(locale)} → {new Date(item.lastAt).toLocaleString(locale)}</Body>
    </Stack>} />
  </ActionReviewSheet>;
}
