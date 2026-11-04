import { CollectionRows } from "./collection-rows";
import { Body, NavigationRow } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";

import { stamp } from "../shared/format";
import { statusLabel } from "../shared/status";

import type { ThreadsPanelProps } from "./types";
import { accountIdentity, recipientIdentity, threadRowPresentation } from "./review-presentation";
import { CollectionSearch, useCollectionSearch } from "./collection-search";

export function ThreadsPanel({
  state,
  projectId,
  projects,
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
      <CollectionSearch {...collection} />
      <CollectionRows page={page} key={projectId ?? "all"} items={collection.visible
        .sort((a, b) => b.lastInboundAt - a.lastInboundAt)} renderItem={(thread) => {
          const row = threadRowPresentation(thread, state.accounts,
            [...(state.contacts ?? []), ...(state.related?.contacts ?? [])], projects, stamp);
          return (
            <NavigationRow
              key={thread.id}
              label={row.title}
              detail={row.latestMessage}
              detailLines={2}
              metadata={`${row.metadata} · ${statusLabel(thread.kind, copy)}`}
              metadataLines={0}
              accessibilityLabel={[row.accessibleLabel, statusLabel(thread.kind, copy), thread.reviewReason].filter(Boolean).join(". ")}
              supporting={thread.reviewReason ? <Body>{thread.reviewReason}</Body> : undefined}
              onPress={() => dispatch({ type: "open", editor: { kind: "thread", id: thread.id } })}
            />
        ); }} />
    </>
  );
}
