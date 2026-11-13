import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ConfirmedInboxComment, ProviderInboxComposerProps } from "./provider-component-types";
import {
  Body,
  Button,
  Disclosure,
  Field,
  FormActions,
  Heading,
  MutationState,
  Notice,
  Stack,
} from "@/ui/primitives";
import { ActionReviewSheet } from "@/ui/action-review-sheet";
import { useCopy } from "@/ui/copy";
import { isInboxWriteUncertain } from "./provider-jobs";
import { providerName } from "./provider-model";
import { commentSubmission } from "./provider-state";

export {
  type ConfirmedInboxComment,
  type ProviderInboxComposerProps,
} from "./provider-component-types";

/** Confirmation freezes the content and recipient; cancellation invokes no write callback. */
export function ProviderInboxComposer({
  item,
  draft,
  onChange,
  onConfirm,
  submission,
  canSend,
}: ProviderInboxComposerProps) {
  const copy = useCopy();
  const uncertain = isInboxWriteUncertain(submission.error);
  const busy = submission.isPending;
  const { body, reply } = draft;
  const review = useMemo(() => ({ active: false }), [item.provider, item.title, item.repo, item.number, item.identifier, draft, canSend, busy, uncertain]);
  const [pending, setPending] = useState<{ confirmed: ConfirmedInboxComment; lease: typeof review } | null>(null);
  const reviewOwner = useRef(pending); reviewOwner.current = pending;
  useLayoutEffect(() => { review.active = true; return () => { review.active = false; reviewOwner.current = null; }; }, [review]);
  const available = () => review.active && canSend && !busy && !uncertain;
  const closeReview = () => { reviewOwner.current = null; setPending(null); };
  useLayoutEffect(() => {
    if (pending && (pending.lease !== review || !available())) closeReview();
  }, [pending, review]);

  function send() {
    const params = commentSubmission(item.provider, draft);
    if (!params.body || !available() || reviewOwner.current) return;
    const next = { confirmed: { params, draft }, lease: review };
    reviewOwner.current = next; setPending(next);
  }
  function confirmReview() {
    if (!pending || reviewOwner.current !== pending || pending.lease !== review || !available()) return;
    reviewOwner.current = null; setPending(null);
    onConfirm(pending.confirmed);
  }
  const reviewedReply = pending?.confirmed.params.inReplyTo ? pending.confirmed.draft.reply : null;
  return (
    <>
    <Stack>
      <Heading>
        {reply
          ? copy("{p0} için yanıt", "Reply to {p0}", { p0: reply.author })
          : copy("Yorum ekle", "Add a comment")}
      </Heading>
      {reply ? (
        <>
          {reply.body.length > 300 ? <Disclosure label={copy("Ayrıntılar", "Details")}>
            <Body muted selectable>{reply.body}</Body>
          </Disclosure> : <Body muted selectable>{reply.body}</Body>}
          <Button
            label={copy("Yanıttan vazgeç", "Cancel reply")}
            disabled={busy || !!pending}
            onPress={() => onChange({ reply: null })}
          />
        </>
      ) : null}
      <Field
        label={copy("Yorum", "Comment")}
        value={body}
        onChangeText={(value) => onChange({ body: value })}
        multiline
        editable={!busy && !pending}
        style={{ minHeight: 140 }}
        maxLength={30_000}
      />
      <FormActions
        feedback={<><MutationState
        mutation={submission}
        success={
          submission.data?.action === "comment"
            ? copy("Yorum gönderildi.", "Comment sent.")
            : undefined
        }
      />
      {uncertain ? (
        <Notice
          tone="warning"
          message={copy(
            "Gönderimin sonucu doğrulanamadı. Yeniden göndermeden önce konuşmayı serviste kontrol et.",
            "The send result is uncertain. Check the provider conversation before sending again.",
          )}
        />
      ) : null}</>}
        submitLabel={copy("Yorumu gönder", "Send comment")}
        disabled={!body.trim() || uncertain || !canSend || !!pending}
        busy={busy}
        onSubmit={send}
      />
      <Disclosure label={copy("Yardım", "Help")}>
        <Body muted>{copy("Taslak bu kayıt açık kaldığı sürece korunur.", "Your draft is retained while this item stays open.")}</Body>
      </Disclosure>
    </Stack>
    {pending && pending.lease === review && canSend && !busy && !uncertain ? <ActionReviewSheet
      title={copy("Yorumu gönder", "Send comment")} submitLabel={copy("Gönder", "Send")}
      onClose={() => { if (reviewOwner.current === pending) closeReview(); }} onConfirm={confirmReview}>
      <Stack>
        <Body selectable>{item.title}</Body>
        <Body muted selectable>{[providerName(item.provider), item.repo, item.identifier ?? `#${item.number}`].filter(Boolean).join(" · ")}</Body>
        <Body>{reviewedReply ? copy("{p0} için yanıt", "Reply to {p0}", { p0: reviewedReply.author }) : copy("Yorum ekle", "Add a comment")}</Body>
        <Body selectable>{pending.confirmed.params.body}</Body>
        {reviewedReply ? <Disclosure label={copy("Ayrıntılar", "Details")}>
          <Body muted selectable>{copy("Hedef", "Target")}: {pending.confirmed.params.inReplyTo}</Body>
          <Body muted selectable>{reviewedReply.body}</Body>
        </Disclosure> : null}
      </Stack>
    </ActionReviewSheet> : null}
    </>
  );
}
