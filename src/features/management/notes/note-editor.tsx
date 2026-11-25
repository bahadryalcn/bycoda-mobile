import { useMobileTheme } from "@/ui/theme";
import { useEditorRecord } from "../shared/use-editor-record";
import { Stack, MutationState, SegmentedControl, ErrorNotice } from "@/ui/primitives";
import { useNoteDraftWriter } from "./use-note-draft-writer";
import { MessageText } from "@/ui/message-text";
import { useSheetGuard } from "@/ui/sheet-guard";
import { useRef, useState } from "react";
import { Body, Button, Card, Field, FormActions, QueryState } from "@/ui/primitives";
import { haptic } from "@/ui/motion";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { useHostQuery } from "@/state/queries";
import { useFormDraft } from "@/state/form-draft";
import type { Note } from "@/domain/types";
import type { LocalNoteDraft } from "../note-drafts";
import type { ExistingNoteProps, NoteEditorProps } from "./types";
import { noteTags, noteTagIssue, noteTitleTooLong } from "./note-tags";

export function ExistingNote({ id, ...props }: ExistingNoteProps) {
  useMobileTheme();
  const query = useHostQuery<Note | null>(["notes", "detail", id], "notes.get", { id });
  useSheetGuard({ pending: props.save.isPending || props.remove.isPending });
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

export function NoteEditor({ initial, save, remove, draftOwner, onClose }: NoteEditorProps) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const base = useRef(initial).current;
  const form = useFormDraft(base);
  const draft = form.values;
  const tags = noteTags(draft.tags);
  const tagIssue = noteTagIssue(tags);
  const titleTooLong = noteTitleTooLong(draft.title);
  const titleError = titleTooLong
    ? copy(
        "Başlık en fazla 200 karakter olmalı. Kaydetmeden önce kısaltın.",
        "The title must be at most 200 characters. Shorten it before saving.",
      )
    : undefined;
  const tagError = tagIssue
    ? tagIssue === "count"
      ? copy(
          "En fazla 20 etiket ekleyin. Hiçbir etiket kaydedilmedi veya kısaltılmadı.",
          "Use at most 20 tags. No tags have been saved or shortened.",
        )
      : copy(
          "Her etiket en fazla 48 karakter olmalı. Etiketinizi kısaltın.",
          "Each tag must be at most 48 characters. Shorten your tag before saving.",
        )
    : undefined;
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const busy = save.isPending || remove.isPending;
  const changed =
    draft.title !== base.title || draft.body !== base.body || draft.tags !== base.tags;
  const { writer, state: draftWrite } = useNoteDraftWriter(draftOwner);
  const draftFailed = draftWrite.status === "error";
  const draftSaving = draftWrite.status === "saving";
  const { requestClose } = useSheetGuard({
    dirty: changed && draftFailed,
    pending: busy || draftSaving,
    onClose,
  });
  // Two patches in one tick must both reach storage, so merge into the newest draft, not the rendered one.
  const newest = useRef(draft);
  const update = (patch: Partial<LocalNoteDraft>) => {
    newest.current = { ...newest.current, ...patch };
    form.patch(patch);
    writer.schedule(newest.current);
  };
  const retryDraft = () => {
    void writer.flush().catch(() => {});
  };
  const finish = () => {
    // The note is safe on the computer; a failed cleanup only leaves a recoverable stale draft.
    void writer.clear(newest.current).catch(() => {});
    onClose();
  };
  // Closing writes the debounced edit first; a failure keeps the editor open with its error and retry.
  const closeAfterFlush = () => {
    void writer.flush().then(requestClose, () => {});
  };
  return (
    <Stack>
      <SegmentedControl
        hideLabel
        label={copy("Görünüm", "View")}
        value={mode}
        options={[
          { value: "edit", label: copy("Düzenle", "Edit") },
          { value: "preview", label: copy("Önizleme", "Preview") },
        ]}
        onChange={setMode}
      />
      {mode === "preview" ? (
        <MessageText
          text={draft.body || copy("Not henüz boş.", "The note is empty.")}
          role="assistant"
        />
      ) : (
        <>
          <Field
            label={copy("Başlık", "Title")}
            error={titleError}
            value={draft.title}
            onChangeText={(title) => update({ title })}
            editable={!busy}
          />
          <Field
            label={copy("Not", "Note")}
            value={draft.body}
            onChangeText={(body) => update({ body })}
            multiline
            editable={!busy}
          />
          <Field
            label={copy("Etiketler", "Tags")}
            hint={copy("Virgülle ayırın", "Separate with commas")}
            error={tagError}
            value={draft.tags}
            onChangeText={(tags) => update({ tags })}
            editable={!busy}
          />
        </>
      )}
      {mode === "preview" && titleError ? (
        <Body accessibilityRole="alert" style={uiStyles.error}>
          {titleError}
        </Body>
      ) : null}
      {mode === "preview" && tagError ? (
        <Body accessibilityRole="alert" style={uiStyles.error}>
          {tagError}
        </Body>
      ) : null}
      <FormActions
        feedback={
          <>
            {!busy && (titleError || tagError) ? <Body muted>{titleError || tagError}</Body> : null}
            <MutationState mutation={save} />
            <MutationState mutation={remove} />
            {draftWrite.status === "error" && (
              <ErrorNotice
                error={draftWrite.error}
                onRetry={retryDraft}
                retryLabel={copy("Taslağı telefona tekrar kaydet", "Retry saving draft on phone")}
              />
            )}
          </>
        }
        submitLabel={copy("Bilgisayara kaydet", "Save to computer")}
        busy={busy}
        disabled={!!tagIssue || titleTooLong}
        onSubmit={() => {
          if (tagIssue || titleTooLong) return;
          save.mutate(
            {
              note: {
                id: draft.id,
                title: draft.title,
                body: draft.body,
                tags,
                ...(draft.sourceCwd ? { sourceCwd: draft.sourceCwd } : {}),
                finalizeSlug: true,
              },
              expectedUpdatedAt: draft.expectedUpdatedAt,
            },
            {
              onSuccess: () => {
                haptic.success();
                finish();
              },
            },
          );
        }}
        cancelDisabled={busy || draftSaving}
        cancelLabel={copy("Vazgeç", "Cancel")}
        onCancel={closeAfterFlush}
      />
      {draft.expectedUpdatedAt > 0 && (
        <Button
          tone="danger"
          label={copy("Notu sil", "Delete note")}
          disabled={busy}
          onPress={() =>
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
            )
          }
        />
      )}
      {changed && draftWrite.status === "saved" && (
        <Body muted>{copy("Taslak bu telefonda saklandı.", "Draft saved on this phone.")}</Body>
      )}
    </Stack>
  );
}
