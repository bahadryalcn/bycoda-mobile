import type { RemoteInboxItem, RemoteInboxReview } from "../../../../src/features/inbox/model/remoteInbox";
import { ActionReviewSheet } from "@/ui/action-review-sheet";
import { Body, Disclosure, ScreenList, Stack } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { prReviewDecisionLabel } from "./provider-labels";

export function ProviderPrReviewPreflight({ item, review, onClose, onConfirm }: {
  item: RemoteInboxItem;
  review: RemoteInboxReview;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const copy = useCopy();
  return <ActionReviewSheet title={copy("Pull request incelemesini gönder", "Submit pull request review")}
    submitLabel={copy("Gönder", "Submit")} onClose={onClose} onConfirm={onConfirm} scroll={false}>
    <ScreenList data={review.comments} keyExtractor={(comment, index) => `${comment.path}:${comment.side}:${comment.line}:${index}`}
      header={<Stack>
        <Body selectable>{item.repo} #{item.number} · {item.title}</Body>
        <Body>{prReviewDecisionLabel(review.event, copy)}</Body>
        <Disclosure label={copy("Commit", "Commit")}>
          <Body muted mono selectable>{review.commitId}</Body>
        </Disclosure>
        {review.body ? <Body selectable>{review.body}</Body> : null}
        <Body muted>{copy("{p0} satır yorumu", "{p0} inline comments", { p0: review.comments.length })}</Body>
      </Stack>}
      renderItem={({ item: comment }) => <Stack>
        <Body mono selectable>{comment.path} · {comment.side === "LEFT"
          ? copy("Eski satır {p0}", "Old line {p0}", { p0: comment.line })
          : copy("Yeni satır {p0}", "New line {p0}", { p0: comment.line })}</Body>
        <Body selectable>{comment.body}</Body>
      </Stack>} />
  </ActionReviewSheet>;
}
