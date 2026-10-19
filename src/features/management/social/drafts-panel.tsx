import { RecordCard } from "@/ui/record-card";
import { MessageText } from "@/ui/message-text";
import { socialLabel } from "./labels";
import { PagedRows } from "../shared/paged-rows";
import { ActionMenu, Sheet, Body, Button, Row } from "@/ui/primitives";
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
          <RecordCard key={draft.id}
            title={state.accounts.find((account) => account.id === draft.accountId)?.name ?? copy("Taslak", "Draft")}
            status={draft.generation ? <Status value={draft.generation.status} /> : undefined}
            metadata={socialLabel(draft.kind, copy)}
            preview={<Body numberOfLines={2}>{draft.text.replace(/\s+/g, " ").trim()}</Body>}
      footer={
            <Row>
              <Button
                label={
                  draft.approvedAt
                    ? copy("Yeniden onayla", "Approve again")
                    : copy("Taslağı onayla", "Approve draft")
                }
                tone={draft.approvedAt ? "quiet" : "primary"}
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
                tone={draft.approvedAt ? "primary" : "quiet"}
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
      }
            details={<MessageText text={draft.text} role="assistant" />}
            menu={<ActionMenu label={copy("Diğer işlemler", "More actions")} actions={[{
              key: "edit", label: copy("Düzenle", "Edit"),
              disabled: action.isPending || !canEditSocialDraft(draft, state.jobs),
              onPress: () => dispatch({ type: "open", editor: { kind: "draft", id: draft.id } }),
            }]} />}
          >
            {draft.reviewReason && <Body>{draft.reviewReason}</Body>}

          </RecordCard>
        )} />
    </>
  );
}
