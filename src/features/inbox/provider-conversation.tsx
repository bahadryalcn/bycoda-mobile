import { MessageText } from "@/ui/message-text";
import { stamp } from "../management/shared/format";
import { useMemo } from "react";
import type {
  ProviderInboxConversationProps,
  ProviderInboxCommentProps,
} from "./provider-component-types";
import { inboxReplyTarget } from "../../../../src/features/inbox/model/remoteInbox";
import { Badge, Body, Button, QueryState, Row, SectionHeader, ScreenList, Stack } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { inboxConversationRows } from "./provider-conversation-model";

export {
  type ProviderInboxConversationProps,
  type ProviderInboxCommentProps,
} from "./provider-component-types";

export function ProviderInboxConversation({
  provider,
  thread,
  onReply,
  disabled,
  onManageConnections,
  hideFeedback = false,
  header,
  refresh,
  visible = true,
}: ProviderInboxConversationProps) {
  const copy = useCopy();
  const rows = useMemo(() => inboxConversationRows(visible ? thread.data?.comments ?? [] : []), [visible, thread.data]);
  return (
    <ScreenList data={rows} keyExtractor={row => row.key} query={thread} refresh={refresh}
      header={<Stack>
      {header}
      {visible ? <SectionHeader flush title={copy("Konuşma", "Conversation")} count={rows.length} /> : null}
      {visible && !hideFeedback ? <QueryState
        query={thread}
        onManageConnections={onManageConnections}
        empty={thread.data?.comments.length === 0}
        emptyTitle={copy("Henüz yorum yok.", "No comments yet.")}
      /> : null}
      {visible && thread.data?.truncated ? <Body muted>{copy("Konuşmanın bir bölümü gösteriliyor. Tüm yorumları serviste açın.",
        "Part of this conversation is shown. Open the provider for all comments.")}</Body> : null}
      </Stack>}
      renderItem={({item: row}) => (
        <ProviderInboxComment
          comment={row.comment}
          depth={row.depth}
          provider={provider}
          onReply={onReply}
          disabled={disabled}
        />
      )} />
  );
}

export function ProviderInboxComment({
  comment,
  provider,
  onReply,
  depth = 0,
  disabled,
}: ProviderInboxCommentProps) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  return (
    <Stack style={{ paddingVertical: space.md, marginStart: depth > 0 ? space.md : 0 }}>
      <Row>
        <Body style={[uiStyles.label, uiStyles.grow]}>{comment.author}</Body>
        {comment.resolved ? <Badge label={copy("Çözüldü", "Resolved")} tone="success" /> : null}
      </Row>
      <Body muted style={uiStyles.caption}>{stamp(comment.createdAt)}</Body>
      <MessageText text={comment.body} role="assistant" />
      {inboxReplyTarget(provider, comment) ? (
        <Button
          label={copy("Yanıtla", "Reply")}
          tone="quiet"
          disabled={disabled}
          onPress={() => onReply(comment)}
        />
      ) : null}
    </Stack>
  );
}
