import { View } from "react-native";
import type { RemoteInboxReview, RemoteInboxReviewComment } from "../../../../src/features/inbox/model/remoteInbox";
import { Body, ErrorText, Field, FormActions, Notice, PressableCard, SectionHeader, SegmentedControl, Sheet } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { fontSize, lineHeight, space } from "@/ui/tokens";
import { prReviewDecisionLabel } from "./provider-labels";
import { anchorLabel } from "./provider-pr-review-file";
import { CommitChip } from "./provider-pr-review-summary";

type Event = RemoteInboxReview["event"];

/**
 * The single place a review is decided and sent: decision, summary, the pending line comments
 * (tap one to edit it in its file) and the reviewed commit, with Submit beside its feedback.
 */
export function PrReviewSubmitSheet({
  event,
  body,
  comments,
  commitId,
  decisions,
  restriction,
  editable,
  canSubmit,
  blockedReason,
  busy,
  error,
  stale,
  onChangeEvent,
  onChangeBody,
  onOpenComment,
  onRebind,
  onSubmit,
  onClose,
}: {
  event: Event;
  body: string;
  comments: readonly RemoteInboxReviewComment[];
  commitId?: string;
  decisions: readonly Event[];
  /** Why some decisions are unavailable (closed or merged pull request). */
  restriction?: string;
  editable: boolean;
  canSubmit: boolean;
  /** Why Submit is unavailable for the current content (missing summary, unmatched line comment). */
  blockedReason?: string;
  busy: boolean;
  error?: unknown;
  stale: boolean;
  onChangeEvent: (event: Event) => void;
  onChangeBody: (body: string) => void;
  onOpenComment: (comment: RemoteInboxReviewComment) => void;
  onRebind: () => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const copy = useCopy();
  const summaryRequired = event !== "APPROVE";
  const submitLabel = event === "APPROVE" ? copy("Onayla", "Approve")
    : event === "REQUEST_CHANGES" ? copy("Değişiklik iste", "Request changes")
    : copy("İncelemeyi gönder", "Submit review");
  return (
    <Sheet visible title={copy("İncelemeyi gönder", "Submit review")} onClose={onClose} dismissible={!busy}>
      {decisions.length > 1 ? (
        <SegmentedControl<Event>
          label={copy("Karar", "Decision")}
          value={event}
          disabled={!editable}
          onChange={onChangeEvent}
          options={decisions.map((value) => ({ value, label: prReviewDecisionLabel(value, copy) }))}
        />
      ) : null}
      {restriction ? <Body muted style={{ fontSize: fontSize.small, lineHeight: lineHeight.small }}>{restriction}</Body> : null}
      <Field
        label={summaryRequired ? copy("Özet (gerekli)", "Summary (required)") : copy("Özet", "Summary")}
        value={body}
        multiline
        maxLength={30_000}
        editable={editable}
        placeholder={summaryRequired ? copy("Kararını kısaca açıkla", "Briefly explain your decision") : copy("İsteğe bağlı", "Optional")}
        onChangeText={onChangeBody}
      />
      {comments.length ? (
        <View>
          <SectionHeader title={copy("Bekleyen satır yorumları", "Pending line comments")} count={comments.length} />
          {comments.map((comment, index) => (
            <PressableCard key={`${comment.path}:${comment.side}:${comment.line}:${index}`}
              label={`${comment.path}, ${anchorLabel(comment, copy)}: ${comment.body}`}
              disabled={!editable} onPress={() => onOpenComment(comment)}
              style={{ gap: space.xxs, paddingVertical: space.sm }}>
              <Body muted mono numberOfLines={1} ellipsizeMode="middle" style={{ fontSize: fontSize.caption, lineHeight: lineHeight.caption }}>
                {`${comment.path} · ${anchorLabel(comment, copy)}`}
              </Body>
              <Body numberOfLines={3}>{comment.body}</Body>
            </PressableCard>
          ))}
        </View>
      ) : null}
      {commitId ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Body muted style={{ fontSize: fontSize.small, lineHeight: lineHeight.small }}>{copy("İncelenen commit", "Reviewing commit")}</Body>
          <CommitChip commitId={commitId} />
        </View>
      ) : null}
      <FormActions
        submitLabel={submitLabel}
        onSubmit={onSubmit}
        busy={busy}
        disabled={!canSubmit}
        feedback={stale ? (
          <Notice tone="warning"
            message={copy("Pull request’e yeni commit geldi. Göndermeden önce güncel farkı incele.", "New commits arrived. Review the current diff before submitting.")}
            action={editable ? { label: copy("Güncel commit’i incele", "Review current head"), onPress: onRebind } : undefined} />
        ) : error ? <ErrorText error={error} />
          : blockedReason ? <Body muted style={{ fontSize: fontSize.small, lineHeight: lineHeight.small }}>{blockedReason}</Body> : undefined}
      />
    </Sheet>
  );
}
