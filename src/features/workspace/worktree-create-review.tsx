import { ActionReviewSheet } from "@/ui/action-review-sheet";
import { Body, Disclosure, Notice, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { worktreeCreateRequest } from "./worktree-create-model";

export function WorktreeCreateReview({ request, machineName, sourcePath, defaultRoot, onClose, onConfirm }: {
  request: ReturnType<typeof worktreeCreateRequest>; machineName: string; sourcePath: string; defaultRoot?: string;
  onClose: () => void; onConfirm: () => void;
}) {
  const copy = useCopy();
  return <ActionReviewSheet title={copy("Worktree oluştur", "Create worktree")} submitLabel={copy("Worktree oluştur", "Create worktree")} onClose={onClose} onConfirm={onConfirm}>
    <Stack>
      <Body selectable>{machineName}</Body><Body mono selectable>{sourcePath}</Body>
      <Body muted>{request.existing ? copy("Mevcut yerel dal", "Existing local branch") : copy("Yeni dal", "New branch")}</Body>
      <Body mono selectable>{request.branch}</Body>
      {!request.existing ? <><Body muted>{copy("Başlangıç dalı", "Base branch")}</Body><Body mono selectable>{request.base}</Body></> : null}
      <Notice message={copy("Hedef klasörü bilgisayardaki bycoda belirler.", "bycoda on the computer chooses the destination folder.")} />
      <Disclosure label={copy("Ayrıntılar", "Details")}><Body mono selectable>{request.projectId}</Body>{defaultRoot ? <Body mono selectable>{defaultRoot}</Body> : null}</Disclosure>
    </Stack>
  </ActionReviewSheet>;
}
