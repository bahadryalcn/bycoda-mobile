import type { ProviderInboxComposerProps } from "./provider-component-types";
import {
  Body,
  Button,
  Card,
  Field,
  FormActions,
  Heading,
  MutationState,
  Notice,
  Stack,
} from "@/ui/primitives";
import { confirmAction } from "@/ui/confirm";
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

  function send() {
    const params = commentSubmission(item.provider, draft);
    if (!params.body || uncertain || busy || !canSend) return;
    confirmAction(
      copy("Yorumu gönder", "Send comment"),
      `${providerName(item.provider)} · ${item.title}\n\n${params.body}`,
      copy("Gönder", "Send"),
      () => onConfirm({ params, draft }),
      copy("Vazgeç", "Cancel"),
    );
  }

  return (
    <Stack>
      <Heading>
        {reply
          ? copy("{p0} için yanıt", "Reply to {p0}", { p0: reply.author })
          : copy("Yorum ekle", "Add a comment")}
      </Heading>
      {reply ? (
        <>
          <Body muted>{reply.body.slice(0, 300)}</Body>
          <Button
            label={copy("Yanıttan vazgeç", "Cancel reply")}
            disabled={busy}
            onPress={() => onChange({ reply: null })}
          />
        </>
      ) : null}
      <Field
        label={copy("Yorum", "Comment")}
        value={body}
        onChangeText={(value) => onChange({ body: value })}
        multiline
        editable={!busy}
        style={{ minHeight: 140 }}
        maxLength={30_000}
      />
      <MutationState
        mutation={submission}
        pending={copy("Bilgisayar sonucu doğruluyor…", "Waiting for the computer to confirm…")}
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
      ) : null}
      <FormActions
        submitLabel={copy("Yorumu gönder", "Send comment")}
        disabled={!body.trim() || uncertain || !canSend}
        busy={busy}
        onSubmit={send}
      />
      <Body muted>{copy("Taslak bu kayıt açık kaldığı sürece korunur.", "Your draft is retained while this item stays open.")}</Body>
    </Stack>
  );
}
