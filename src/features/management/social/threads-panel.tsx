import { ContentExcerpt } from "./content-excerpt";
import { PagedRows } from "../shared/paged-rows";
import { Sheet, Disclosure, Body, Button, Card, Row } from "@/ui/primitives";
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
          <Card key={thread.id}>
            <Row>
              <Status value={thread.kind} />
              <Body muted>
                {state.accounts.find((account) => account.id === thread.accountId)?.name} ·{" "}
                {stamp(thread.lastInboundAt)}
              </Body>
            </Row>
            <ContentExcerpt text={thread.events.filter((event) => event.direction === "inbound").at(-1)?.text ?? ""} />
            {thread.reviewReason && <Body>{thread.reviewReason}</Body>}
            <Button
              label={copy("Konuşmayı aç", "Open conversation")}
              onPress={() => dispatch({ type: "open", editor: { kind: "thread", id: thread.id } })}
            />
          </Card>
        )} />
    </>
  );
}
