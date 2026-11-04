import { Body, Disclosure, Stack } from "@/ui/primitives";
import { ActionReviewSheet } from "@/ui/action-review-sheet";
import { useCopy } from "@/ui/copy";
import type { JiraBoardSnapshot, JiraMobileIssue } from "./jira-board-model";
import type { InboxJobRequest } from "./provider-protocol";

export type JiraBoardCommand = InboxJobRequest<"jira-board-transition" | "jira-board-move">;
export type JiraBoardReview = { command: JiraBoardCommand; description: string };

/** Presentation only: the originating editor retains review and delivery authority. */
export function JiraBoardActionReview({ review, snapshot, issue, onClose, onConfirm }: {
  review: JiraBoardReview;
  snapshot: JiraBoardSnapshot;
  issue: JiraMobileIssue;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const copy = useCopy();
  return <ActionReviewSheet title={copy("Jira işlemini incele", "Review Jira action")} onClose={onClose}
    submitLabel={copy("Bilgisayarda onay iste", "Request approval on computer")} onConfirm={onConfirm}>
    <Stack>
      <Body selectable>{issue.identifier} · {issue.title}</Body>
      <Body muted selectable>{copy("Pano", "Board")}: {snapshot.board.name}</Body>
      <Body selectable>{review.description}</Body>
      <Body muted>{copy("İşlem bilgisayarda tam hedefiyle yeniden onaylanır. Jira’daki eşzamanlı değişiklikler sunucu tarafında atomik olarak kilitlenemez.",
        "The exact action requires approval on the computer. Concurrent changes in Jira cannot be locked atomically by this client.")}</Body>
      <Disclosure label={copy("Ayrıntılar", "Details")}>
        <Body muted selectable>{copy("Proje", "Project")}: {snapshot.projectCwd}</Body>
        <Body mono selectable>{JSON.stringify(review.command, null, 2)}</Body>
      </Disclosure>
    </Stack>
  </ActionReviewSheet>;
}
