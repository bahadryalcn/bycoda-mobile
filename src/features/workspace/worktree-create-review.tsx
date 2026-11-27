import { ActionReviewSheet } from "@/ui/action-review-sheet";
import { Body, Notice, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { worktreeCreateRequest } from "./worktree-create-model";

export function WorktreeCreateReview({ request, machineName, sourcePath, defaultRoot, onClose, onConfirm }: {
  request: ReturnType<typeof worktreeCreateRequest>; machineName: string; sourcePath: string; defaultRoot?: string;
  onClose: () => void; onConfirm: () => void;
}) {
  const copy = useCopy();
  return <ActionReviewSheet title={copy("Çalışma ağacı oluştur", "Create worktree")} submitLabel={copy("Çalışma ağacı oluştur", "Create worktree")} onClose={onClose} onConfirm={onConfirm}>
    <Stack>
      <Body selectable>{machineName}</Body><Body mono selectable>{sourcePath}</Body>
      <Body muted>{request.existing ? copy("Mevcut yerel dal", "Existing local branch") : copy("Yeni dal", "New branch")}</Body>
      <Body mono selectable>{request.branch}</Body>
      {!request.existing ? <><Body muted>{copy("Başlangıç dalı", "Base branch")}</Body><Body mono selectable>{request.base}</Body></> : null}
      <Notice message={copy("Hedef klasörü bilgisayardaki bycoda belirler.", "bycoda on the computer chooses the destination folder.")} />
      <Body mono muted selectable>{request.projectId}</Body>{defaultRoot ? <Body mono muted selectable>{defaultRoot}</Body> : null}
    </Stack>
  </ActionReviewSheet>;
}
