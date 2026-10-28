import { CollectionRows } from "./collection-rows";
import { Sheet, Body, NavigationRow } from "@/ui/primitives";
import { View } from "react-native";
import { useCopy } from "@/ui/copy";

import { stamp } from "../shared/format";
import { Status, statusLabel } from "../shared/status";

import { ThreadEditor } from "./thread-editor";
import type { ThreadsPanelProps } from "./types";
import { accountIdentity, recipientIdentity, threadRowPresentation } from "./review-presentation";
import { CollectionSearch, useCollectionSearch } from "./collection-search";

export function ThreadsPanel({
  state,
  projectId,
  selectedThread,
  projects,
  closeEditor,
  dispatch,
  page,
}: ThreadsPanelProps) {
  const copy = useCopy();
  const collection = useCollectionSearch(page ? state.threads : state.threads.filter((thread) => !projectId || thread.projectId === projectId),
    (thread) => [recipientIdentity([...(state.contacts ?? []), ...(state.related?.contacts ?? [])], thread.accountId, thread.contactId),
      accountIdentity(state.accounts, thread.accountId),
      thread.projectId && (projects.find((project) => project.id === thread.projectId)?.name ?? thread.projectId),
      stamp(thread.lastInboundAt), statusLabel(thread.kind, copy), thread.reviewReason,
      thread.events.filter((event) => event.direction === "inbound").at(-1)?.text,
    ].filter(Boolean).join(" "), page);
  return (
    <>
      {selectedThread && (
        <Sheet visible size="form" title={copy("Konuşma", "Conversation")} onClose={closeEditor}>
        <ThreadEditor
          key={selectedThread.id}
          thread={selectedThread}
          recipientLabel={recipientIdentity([...(state.contacts ?? []), ...(state.related?.contacts ?? [])], selectedThread.accountId, selectedThread.contactId)}
          accounts={state.accounts}
          projects={projects}
          profiles={state.profiles}
          onClose={closeEditor}
        />
        </Sheet>
      )}
      <CollectionSearch {...collection} />
      <CollectionRows page={page} key={projectId ?? "all"} items={collection.visible
        .sort((a, b) => b.lastInboundAt - a.lastInboundAt)} renderItem={(thread) => {
          const row = threadRowPresentation(thread, state.accounts,
            [...(state.contacts ?? []), ...(state.related?.contacts ?? [])], projects, stamp);
          return (
          <View key={thread.id}>
            <NavigationRow
              label={row.title}
              detail={row.latestMessage}
              detailLines={2}
              metadata={row.metadata}
              accessibilityLabel={`${row.accessibleLabel}. ${statusLabel(thread.kind, copy)}`}
              trailing={<Status value={thread.kind} />}
              onPress={() => dispatch({ type: "open", editor: { kind: "thread", id: thread.id } })}
            />
            {thread.reviewReason && <Body>{thread.reviewReason}</Body>}
          </View>
        ); }} />
    </>
  );
}
