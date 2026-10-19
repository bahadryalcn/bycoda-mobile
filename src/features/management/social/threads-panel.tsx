import { PagedRows } from "../shared/paged-rows";
import { Sheet, Body, NavigationRow } from "@/ui/primitives";
import { View } from "react-native";
import { useCopy } from "@/ui/copy";

import { stamp } from "../shared/format";
import { Status } from "../shared/status";

import { ThreadEditor } from "./thread-editor";
import type { ThreadsPanelProps } from "./types";

export function ThreadsPanel({
  state,
  projectId,
  selectedThread,
  projects,
  closeEditor,
  dispatch,
}: ThreadsPanelProps) {
  const copy = useCopy();
  return (
    <>
      {selectedThread && (
        <Sheet visible size="form" title={copy("Konuşma", "Conversation")} onClose={closeEditor}>
        <ThreadEditor
          key={selectedThread.id}
          thread={selectedThread}
          accounts={state.accounts}
          projects={projects}
          profiles={state.profiles}
          onClose={closeEditor}
        />
        </Sheet>
      )}
      <PagedRows key={projectId ?? "all"} items={state.threads
        .filter((thread) => !projectId || thread.projectId === projectId)
        .sort((a, b) => b.lastInboundAt - a.lastInboundAt)} renderItem={(thread) => (
          <View key={thread.id}>
            <NavigationRow
              label={state.accounts.find((account) => account.id === thread.accountId)?.name ?? copy("Konuşma", "Conversation")}
              detail={[stamp(thread.lastInboundAt), thread.events.filter((event) => event.direction === "inbound").at(-1)?.text ?? ""].filter(Boolean).join(" · ")}
              detailLines={2}
              trailing={<Status value={thread.kind} />}
              onPress={() => dispatch({ type: "open", editor: { kind: "thread", id: thread.id } })}
            />
            {thread.reviewReason && <Body>{thread.reviewReason}</Body>}
          </View>
        )} />
    </>
  );
}
