import { useMobileTheme } from "@/ui/theme";
import { useEditorRecord } from "../shared/use-editor-record";
import { Stack, MutationState, SegmentedControl } from "@/ui/primitives";
import { MessageText } from "@/ui/message-text";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useRef, useState } from "react";
import { uiStyles } from "@/ui/styles";
import { ActionMenu, Body, Button, Card, Field, FormActions, Heading, QueryState, Row } from "@/ui/primitives";
import { haptic } from "@/ui/motion";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { useHostQuery } from "@/state/queries";
import { useFormDraft } from "@/state/form-draft";
import type { Note } from "@/domain/types";
import type { LocalNoteDraft } from "../note-drafts";
import type { ExistingNoteProps, NoteEditorProps } from "./types";

export function ExistingNote({ id, ...props }: ExistingNoteProps) {
  useMobileTheme();
  const query = useHostQuery<Note | null>(["notes", "detail", id], "notes.get", { id });
  const copy = useCopy();
  const note = useEditorRecord(id, query.data ?? undefined);
  if (!note)
    return (
      <Card>
        <QueryState
          query={query}
          empty={query.data === null}
          emptyTitle={copy("Not bulunamadı.", "Note not found.")}
        />
        <Button
          label={copy("Kapat", "Close")}
          disabled={props.save.isPending || props.remove.isPending}
          onPress={() => {
            if (!props.save.isPending && !props.remove.isPending) props.onClose();
          }}
        />
      </Card>
    );
  // This revision is the editor's conflict base; later polling must not replace an unsaved draft.
  return (
    <NoteEditor
      key={id}
      initial={{
        ...note,
        tags: note.tags.join(", "),
        expectedUpdatedAt: note.updatedAt,
      }}
      {...props}
    />
  );
}

export function NoteEditor({ initial, save, remove, storage, onClose }: NoteEditorProps) {
  useMobileTheme();
  const copy = useCopy();
  const base = useRef(initial).current;
  const form = useFormDraft(base);
  const draft = form.values;
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const busy = save.isPending || remove.isPending;
  const changed =
    draft.title !== base.title || draft.body !== base.body || draft.tags !== base.tags;
  const { requestClose } = useSheetGuard({ dirty: changed && storage.isError, pending: busy || storage.isPending, onClose });
  const update = (patch: Partial<LocalNoteDraft>) => {
    form.patch(patch);
    storage.mutate({ kind: "save", draft: { ...draft, ...patch } });
  };
  const finish = () => {
    storage.mutate({ kind: "clear", draft });
    onClose();
  };
  return (
    <Stack>
      <SegmentedControl label={copy("Görünüm", "View")} value={mode} options={[{value:"edit",label:copy("Düzenle","Edit")},{value:"preview",label:copy("Önizleme","Preview")}]} onChange={setMode} />
      {mode === "preview" ? <MessageText text={draft.body || copy("Not henüz boş.", "The note is empty.")} role="assistant" /> : <>
      <Field
        label={copy("Başlık", "Title")}
        value={draft.title}
        onChangeText={(title) => update({ title })}
        editable={!busy}
      />
      <Field
        label={copy("Not (Markdown)", "Note (Markdown)")}
        value={draft.body}
        onChangeText={(body) => update({ body })}
        multiline
        style={{ minHeight: 160, textAlignVertical: "top" }}
        editable={!busy}
      />
      <Field
        label={copy("Etiketler (virgülle ayırın)", "Tags (comma separated)")}
        value={draft.tags}
        onChangeText={(tags) => update({ tags })}
        editable={!busy}
      />
      </>}
      <FormActions
        feedback={<><MutationState mutation={save} />
      <MutationState mutation={remove} />
      <MutationState mutation={storage} />
      {storage.isError && (
        <Button
          label={copy("Taslağı telefona tekrar kaydet", "Retry saving draft on phone")}
          onPress={() => storage.mutate({ kind: "save", draft })}
        />
      )}</>}
        submitLabel={copy("Bilgisayara kaydet", "Save to computer")}
        busy={busy}
        onSubmit={() =>
          save.mutate(
            {
              note: {
                id: draft.id,
                title: draft.title,
                body: draft.body,
                tags: draft.tags.split(","),
                ...(draft.sourceCwd ? { sourceCwd: draft.sourceCwd } : {}),
                finalizeSlug: true,
              },
              expectedUpdatedAt: draft.expectedUpdatedAt,
            },
            { onSuccess: () => { haptic.success(); finish(); } },
          )
        }
        cancelDisabled={busy || storage.isPending}
        cancelLabel={copy("Kapat", "Close")}
        onCancel={requestClose}
      />
      {draft.expectedUpdatedAt > 0 && (
        <Row style={{ justifyContent: "flex-end" }}>
          <ActionMenu
            label={copy("Not işlemleri", "Note actions")}
            actions={[
              {
                key: "delete",
                label: copy("Notu sil", "Delete note"),
                destructive: true,
                disabled: busy,
                onPress: () =>
                  confirmAction(
                    copy("Notu sil", "Delete note"),
                    copy(
                      "Bu not bilgisayardan kalıcı olarak silinecek.",
                      "This note will be permanently deleted from the computer.",
                    ),
                    copy("Sil", "Delete"),
                    () =>
                      remove.mutate(
                        { id: draft.id, expectedUpdatedAt: draft.expectedUpdatedAt },
                        { onSuccess: finish },
                      ),
                    copy("Vazgeç", "Cancel"),
                  ),
              },
            ]}
          />
        </Row>
      )}
      {changed && !storage.isError && !storage.isPending && <Body muted>{copy("Taslak bu telefonda saklandı.", "Draft saved on this phone.")}</Body>}
      <Body muted style={uiStyles.caption}>
        {copy(
          "Bilgisayarda daha yeni bir düzenleme varsa kaydetme engellenir ve taslağınız korunur.",
          "If the computer has a newer edit, saving is blocked and your draft is retained.",
        )}
      </Body>
    </Stack>
  );
}
