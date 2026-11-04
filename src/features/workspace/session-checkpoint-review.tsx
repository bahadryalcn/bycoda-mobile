import { Body, Disclosure, Notice, ScreenList, Stack } from "@/ui/primitives";
import { ActionReviewSheet } from "@/ui/action-review-sheet";
import { useCopy } from "@/ui/copy";
import { GitDiffViewer } from "./git-diff-viewer";
import { useDiffPreview } from "./use-diff-preview";
import type { ReviewedCheckpointDiff, RewindReview } from "./session-checkpoint-model";
import type { HostSession } from "./wire";

export type CheckpointReview = { kind: "file"; diff: ReviewedCheckpointDiff; undo: boolean; checkpoint: string } |
  { kind: "rewind"; review: RewindReview; blocks: HostSession["session"]["blocks"] };

/** Review contains the frozen content; transport and command authority stay in the owner. */
export function SessionCheckpointReview({ value, machineName, cwd, onClose, onConfirm }: {
  value: CheckpointReview; machineName: string; cwd: string; onClose: () => void; onConfirm: () => void;
}) {
  const copy = useCopy();
  const diff = value.kind === "file" ? value.diff : undefined;
  const preview = useDiffPreview(diff && !diff.binary && !diff.tooLarge ? diff.original : undefined, diff && !diff.binary && !diff.tooLarge ? diff.current : undefined);
  const title = value.kind === "rewind" ? copy("Konuşmayı geri sar", "Rewind conversation") : value.undo ? copy("Dosya değişikliklerini geri al", "Undo file changes") : copy("Değişiklikleri koru", "Keep changes");
  return <ActionReviewSheet title={title} submitLabel={title} tone={value.kind === "rewind" || value.undo ? "danger" : undefined}
    scroll={value.kind !== "rewind"} onClose={onClose} onConfirm={onConfirm}>
    {value.kind === "file" ? <Stack>
      <Body selectable>{machineName}</Body><Body mono selectable>{cwd}</Body><Body mono selectable>{value.diff.relative}</Body>
      <Notice tone={value.undo ? "warning" : "info"} message={value.undo ? copy("Yalnız bu oturumun incelenen değişiklikleri geri alınacak.", "Only this session’s reviewed changes will be undone.") : copy("Dosya korunacak ve oturum inceleme listesinden çıkarılacak.", "The file will stay and leave this session’s review list.")} />
      {value.diff.binary || value.diff.tooLarge || preview?.tooLarge ? <Notice message={copy("Bu dosya için satır farkı gösterilemiyor.", "Line diff is unavailable for this file.")} /> : preview ? <GitDiffViewer lines={preview.lines} /> : <Body muted>{copy("Diff hesaplanıyor…", "Computing diff…")}</Body>}
      {preview?.truncated ? <Notice message={copy("Fark önizlemesi kısaltıldı. Dosyanın tamamını bilgisayarda incele.", "The diff preview is truncated. Review the complete file on the computer.")} /> : null}
      <Disclosure label={copy("Ayrıntılar", "Details")}><Body mono selectable>{value.checkpoint}</Body></Disclosure>
    </Stack> : <ScreenList data={value.blocks} keyExtractor={block => block.id} header={<Stack>
      <Body selectable>{machineName}</Body><Body mono selectable>{cwd}</Body>
      <Notice tone="warning" message={copy("Seçilen mesaj ve sonrasını konuşmadan kaldırır; dosyaları değiştirmez. Mesaj taslağa geri döner.", "Removes the selected message and later messages from the conversation; files stay unchanged. The prompt returns to the draft.")} />
      <Body>{copy("Kaldırılacak mesaj ve etkinlik sayısı: {p0}", "Messages and activities to remove: {p0}", { p0: value.review.affectedIds.length })}</Body>
      <Disclosure label={copy("Ayrıntılar", "Details")}><Body mono selectable>{value.review.sessionId}</Body><Body mono selectable>{value.review.blockId}</Body></Disclosure>
    </Stack>} renderItem={({item}) => <Stack><Body muted>{item.role}</Body><Body selectable>{item.text || item.id}</Body></Stack>} />}
  </ActionReviewSheet>;
}
