import { MessageText } from "@/ui/message-text";
import { stamp } from "../management/shared/format";
import { useMemo } from "react";
import type {
  ProviderInboxConversationProps,
  ProviderInboxCommentProps,
} from "./provider-component-types";
import { inboxReplyTarget } from "../../../../src/features/inbox/model/remoteInbox";
import { Body, Button, QueryState, Row, SectionHeader, ScreenList, Stack, StatusLine, StatusText } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { inboxConversationRows } from "./provider-conversation-model";
import { isBotActivity } from "../pull-requests/model/list";
import { ProviderReactions } from "./provider-reactions";

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
  showBotActivity = true,
  onShowBotActivity,
  onReaction,
}: ProviderInboxConversationProps) {
  const copy = useCopy();
  const allRows = useMemo(() => inboxConversationRows(visible ? thread.data?.comments ?? [] : []), [visible, thread.data]);
  const botRows = useMemo(() => allRows.filter(row => isBotActivity(row.comment.author)).length, [allRows]);
  const rows = useMemo(() => showBotActivity ? allRows : allRows.filter(row => !isBotActivity(row.comment.author)), [allRows, showBotActivity]);
  return (
    <ScreenList data={rows} keyExtractor={row => row.key} query={thread} refresh={refresh}
      header={<Stack>
      {header}
      {visible ? <SectionHeader flush={!header} title={copy("Konuşma", "Conversation")} count={rows.length} /> : null}
      {/* Bot comments (CI, dependency bots) can be folded away; the line says how many and undoes it. */}
      {visible && onShowBotActivity && botRows > 0 ? <StatusLine
        label={showBotActivity ? copy("{p0} bot yorumu", "{p0} bot comments", { p0: botRows }) : copy("{p0} bot yorumu gizli", "{p0} bot comments hidden", { p0: botRows })}
        action={{ label: showBotActivity ? copy("Gizle", "Hide") : copy("Göster", "Show"), onPress: () => onShowBotActivity(!showBotActivity) }} /> : null}
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
          onReaction={onReaction}
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
  onReaction,
}: ProviderInboxCommentProps) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  return (
    <Stack style={{ paddingVertical: space.md, marginStart: depth > 0 ? space.md : 0 }}>
      <Row>
        <Body style={[uiStyles.label, uiStyles.grow]}>{comment.author}</Body>
        {comment.resolved ? <StatusText label={copy("Çözüldü", "Resolved")} /> : null}
      </Row>
      <Body muted style={uiStyles.caption}>{stamp(comment.createdAt)}</Body>
      <MessageText text={comment.body} role="assistant" />
      {provider === "github" && onReaction ? <ProviderReactions disabled={disabled} onReaction={(mode, content) => onReaction(comment, mode, content)} /> : null}
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
