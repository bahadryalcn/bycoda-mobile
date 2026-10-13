import { ContentExcerpt } from "./content-excerpt";
import { socialLabel } from "./labels";
import { PagedRows } from "../shared/paged-rows";
import { Sheet, Disclosure, Body, Button, Card, Row } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";

import { Status } from "../shared/status";
import { canEditSocialDraft } from "../social-content";

import { DraftEditor } from "./draft-editor";
import type { DraftsPanelProps } from "./types";

export function DraftsPanel({
  state,
  projectId,
  selectedDraft,
  closeEditor,
  dispatch,
  action,
  run,
}: DraftsPanelProps) {
  const copy = useCopy();
  return (
    <>
      {selectedDraft && (
        <Sheet visible size="form" title={copy("Taslağı düzenle", "Edit draft")} onClose={closeEditor}>
        <DraftEditor
          key={selectedDraft.id}
          draft={selectedDraft}
          thread={state.threads.find((thread) => thread.id === selectedDraft.threadId)}
          profile={state.profiles.find((profile) => profile.projectId === selectedDraft.projectId)}
          onClose={closeEditor}
        />
        </Sheet>
      )}
      <PagedRows key={projectId ?? "all"} items={state.drafts
        .filter((draft) => !projectId || draft.projectId === projectId)} renderItem={(draft) => (
          <Card key={draft.id}>
            <Body muted>
              {state.accounts.find((account) => account.id === draft.accountId)?.name} ·{" "}
              {socialLabel(draft.kind, copy)}
            </Body>
            <ContentExcerpt text={draft.text} />
            {draft.reviewReason && <Body>{draft.reviewReason}</Body>}
            {draft.generation && <Status value={draft.generation.status} />}
            <Row>
              <Button
                label={copy("Düzenle", "Edit")}
                disabled={action.isPending || !canEditSocialDraft(draft, state.jobs)}
                onPress={() => dispatch({ type: "open", editor: { kind: "draft", id: draft.id } })}
              />
              <Button
                label={
                  draft.approvedAt
                    ? copy("Yeniden onayla", "Approve again")
                    : copy("Taslağı onayla", "Approve draft")
                }
                disabled={
                  action.isPending ||
                  !!draft.reviewReason ||
                  (!!draft.generation && draft.generation.status !== "completed")
                }
                onPress={() =>
                  confirmAction(
                    copy("Taslağı onayla", "Approve draft"),
                    copy(
                      "Onay bu metin ve alıcı için verilir. Düzenleme onayı kaldırır.",
                      "Approval applies to this text and recipient. Editing removes it.",
                    ),
                    copy("Onayla", "Approve"),
                    () => run("drafts.approve", { id: draft.id }),
                  )
                }
              />
              <Button
                label={copy("Gönder", "Send")}
                disabled={
                  !draft.approvedAt || !state.sendingEnabled || state.stopped || action.isPending
                }
                onPress={() =>
                  confirmAction(
                    copy("Dışarıya gönder", "Send externally"),
                    `${state.accounts.find((account) => account.id === draft.accountId)?.name ?? ""}\n\n${draft.text}`,
                    copy("Gönder", "Send"),
                    () =>
                      run(
                        `${draft.kind === "reply" ? "replies" : draft.kind === "message" ? "messages" : "comments"}.send`,
                        { id: draft.id },
                      ),
                  )
                }
              />
            </Row>
          </Card>
        )} />
    </>
  );
}
