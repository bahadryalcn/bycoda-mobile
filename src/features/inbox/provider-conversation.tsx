import { PagedRows } from "../management/shared/paged-rows";
import { MessageText } from "@/ui/message-text";
import { stamp } from "../management/shared/format";
import { useState } from "react";
import type {
  ProviderInboxConversationProps,
  ProviderInboxCommentProps,
} from "./provider-component-types";
import { inboxReplyTarget } from "../../../../src/features/inbox/model/remoteInbox";
import { Badge, Body, Button, Notice, QueryState, Row, Section, Stack } from "@/ui/primitives";
import { uiStyles } from "@/ui/styles";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";

export {
  type ProviderInboxConversationProps,
  type ProviderInboxCommentProps,
} from "./provider-component-types";

export function ProviderInboxConversation({
  provider,
  thread,
  onReply,
  disabled,
}: ProviderInboxConversationProps) {
  const copy = useCopy();
  return (
    <Section title={copy("Konuşma", "Conversation")}>
      <QueryState
        query={thread}
        empty={thread.data?.comments.length === 0}
        emptyTitle={copy("Henüz yorum yok.", "No comments yet.")}
      />
      {thread.data?.truncated ? (
        <Notice
          tone="warning"
          message={copy(
            "Servis konuşmanın bir bölümünü döndürdü. Tamamını serviste açabilirsin.",
            "The provider returned part of this conversation. Open the provider for the full thread.",
          )}
        />
      ) : null}
      <PagedRows items={thread.data?.comments ?? []} renderItem={(comment) => (
        <ProviderInboxComment
          key={comment.id}
          comment={comment}
          provider={provider}
          onReply={onReply}
          disabled={disabled}
        />
      )} />
    </Section>
  );
}

export function ProviderInboxComment({
  comment,
  provider,
  onReply,
  depth = 0,
  disabled,
}: ProviderInboxCommentProps) {
  const copy = useCopy();
  const [expanded, setExpanded] = useState(false);
  return (
    <Stack style={{ paddingVertical: space.sm }}>
      <Row>
        <Body style={[uiStyles.label, uiStyles.grow]}>{comment.author}</Body>
        <Body muted style={uiStyles.caption}>{stamp(comment.createdAt)}</Body>
        {comment.resolved ? <Badge label={copy("Çözüldü", "Resolved")} tone="success" /> : null}
      </Row>
      <MessageText text={comment.body} role="assistant" />
      {inboxReplyTarget(provider, comment) ? (
        <Button
          label={copy("Yanıtla", "Reply")}
          tone="quiet"
          disabled={disabled}
          onPress={() => onReply(comment)}
        />
      ) : null}
      {depth < 3 || expanded ? (
        (comment.replies ?? []).map((reply) => (
          <ProviderInboxComment
            key={reply.id}
            comment={reply}
            provider={provider}
            onReply={onReply}
            depth={depth + 1}
            disabled={disabled}
          />
        ))
      ) : comment.replies?.length ? (
        <Button
          label={copy(
            `${comment.replies.length} yanıtı göster`,
            `Show ${comment.replies.length} replies`,
          )}
          onPress={() => setExpanded(true)}
        />
      ) : null}
    </Stack>
  );
}
