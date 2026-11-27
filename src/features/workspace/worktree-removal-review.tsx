import { ActionReviewSheet } from "@/ui/action-review-sheet";
import { Body, Notice, ScreenList, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import type { WorktreeRemovalSnapshot } from "./worktree-removal-model";
import type { ReactNode } from "react";

/** Host snapshot and desktop approval remain owned by WorktreeRemoval. */
export function WorktreeRemovalReview({ value, machineName, disabled, busy, feedback, onClose, onConfirm }: {
  value: WorktreeRemovalSnapshot; machineName: string; disabled: boolean; busy: boolean; feedback: ReactNode; onClose: () => void; onConfirm: () => void;
}) {
  const copy = useCopy();
  return <ActionReviewSheet title={copy("Çalışma ağacı kaldırma", "Worktree removal")} submitLabel={copy("Bilgisayar onayı iste", "Request computer approval")}
    tone="danger" scroll={false} disabled={disabled} busy={busy} feedback={feedback} onClose={onClose} onConfirm={onConfirm}>
    <ScreenList data={value.effects.detachSessionIds} keyExtractor={id => id} header={<Stack>
      <Body selectable>{machineName}</Body><Body mono selectable>{value.path}</Body>
      <Body muted>{copy("Dal", "Branch")}</Body><Body mono selectable>{value.branch || "HEAD"}</Body>
      <Notice message={copy("Dal ve oturumlar korunur. Kaldırma için bilgisayarda yeni onay gerekir. Ana çalışma kopyasındaki bir oturumdan açın.", "The branch and sessions are retained. Removal requires fresh approval on the computer. Open this from a session in the base working copy.")} />
      <Notice message={copy("Harici Git ve dosya sistemi değişiklikleri atomik olarak kilitlenemez. Bilgisayar işlemden önce yeniden denetler.", "External Git and filesystem changes cannot be locked atomically. The computer checks again before removal.")} />
      {value.reasons.map(reason => <Notice key={reason} tone="warning" message={reason} />)}
      <Body mono muted selectable>{value.head}</Body><Body mono muted selectable>{value.effects.rebindProjectCwd}</Body>
      <Body>{copy("Bağlı oturumlar", "Linked sessions")}: {value.sessionIds.length}</Body>
    </Stack>} renderItem={({item}) => <Body mono selectable>{item}</Body>} />
  </ActionReviewSheet>;
}
