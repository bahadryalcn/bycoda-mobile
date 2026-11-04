import type {
  AssistantMessage,
  AssistantThread,
} from "../../../../src/shared/model/host-contracts/assistant";

export type AssistantHistoryAccess = { ready: boolean; visible(id: string): boolean };
export function assistantThreadVisible(thread: AssistantThread, access: AssistantHistoryAccess) {
  return !thread.projectId || (access.ready && access.visible(thread.projectId));
}
export function assistantMessageVisible(message: AssistantMessage, access: AssistantHistoryAccess) {
  return (
    Array.isArray(message.projectIds) &&
    (message.projectIds.length === 0 ||
      (access.ready && message.projectIds.every((id) => access.visible(id))))
  );
}
export function assistantSummaryVisible(thread: AssistantThread, access: AssistantHistoryAccess) {
  return (
    !!thread.summaryProof &&
    assistantThreadVisible(thread, access) &&
    (thread.summaryProof.projectIds.length === 0 ||
      (access.ready && thread.summaryProof.projectIds.every((id) => access.visible(id))))
  );
}
/** Keep the canonical page cursor even when every item on that page is concealed. */
export function assistantHistoryPage(
  messages: AssistantMessage[],
  threadId: string,
  previous: AssistantMessage[] = [],
  prepend = false,
) {
  if ([...messages, ...previous].some((message) => message.threadId !== threadId))
    throw new Error("The conversation source changed.");
  if (
    messages.some(
      (message, index) => index > 0 && message.createdAt < messages[index - 1].createdAt,
    )
  )
    throw new Error("The conversation page order changed.");
  // Equal timestamps retain the Host's actual row order, never a lexical ID guess.
  const ordered = prepend ? [...messages, ...previous] : [...previous, ...messages];
  const rows = new Map(ordered.map((message) => [message.id, message]));
  for (const message of messages) rows.set(message.id, message);
  return {
    messages: [...rows.values()].sort((a, b) => a.createdAt - b.createdAt),
    before: messages[0]?.createdAt,
    beforeId: messages[0]?.id,
  };
}
