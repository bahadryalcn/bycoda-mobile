import type { ProviderInboxComposerProps } from "./provider-component-types";
import {
  Body,
  Button,
  Disclosure,
  FormActions,
  Input,
  MutationState,
  Notice,
  Stack,
} from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { useCopy } from "@/ui/copy";
import { isInboxWriteUncertain } from "./provider-jobs";
import { commentSubmission } from "./provider-state";

export {
  type ConfirmedInboxComment,
  type ProviderInboxComposerProps,
} from "./provider-component-types";

/**
 * Like the desktop, a comment is sent from its editor without a separate confirmation: the Send
 * action freezes the text and the reply target it shows. A running or uncertain send blocks another.
 */
export function ProviderInboxComposer({
  item,
  draft,
  onChange,
  onConfirm,
  submission,
  canSend,
}: ProviderInboxComposerProps) {
  const copy = useCopy();
  useMobileTheme();
  const uncertain = isInboxWriteUncertain(submission.error);
  const busy = submission.isPending;
  const { body, reply } = draft;

  function send() {
    const params = commentSubmission(item.provider, draft);
    if (!params.body || !canSend || busy || uncertain) return;
    onConfirm({ params, draft });
  }
  return (
    <Stack>
      {/* The sheet title names the task (Add a comment / Reply to …); the editor needs no second heading or label. */}
      {reply ? (
        <>
          {reply.body.length > 300 ? <Disclosure label={copy("Ayrıntılar", "Details")}>
            <Body muted selectable>{reply.body}</Body>
          </Disclosure> : <Body muted selectable>{reply.body}</Body>}
          <Button
            label={copy("Yanıttan vazgeç", "Cancel reply")}
            tone="quiet"
            disabled={busy}
            onPress={() => onChange({ reply: null })}
          />
        </>
      ) : null}
      {/* Grows with the text from a few lines; GitHub renders the Markdown. */}
      <Input
        label={copy("Yorum", "Comment")}
        placeholder={copy("Yorumunu yaz (Markdown desteklenir)", "Write your comment (Markdown supported)")}
        value={body}
        onChangeText={(value) => onChange({ body: value })}
        multiline
        scrollEnabled={false}
        editable={!busy}
        style={{ minHeight: 96 }}
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
        disabled={!body.trim() || uncertain || !canSend}
        busy={busy}
        onSubmit={send}
      />
    </Stack>
  );
}
