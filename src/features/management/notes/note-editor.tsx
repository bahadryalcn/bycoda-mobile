import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { Keyboard, ScrollView, View, type TextInputInstance } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import CopyIcon from "lucide-react-native/icons/copy";
import Eye from "lucide-react-native/icons/eye";
import Pencil from "lucide-react-native/icons/pencil";
import Trash2 from "lucide-react-native/icons/trash-2";
import X from "lucide-react-native/icons/x";
import { useMobileTheme } from "@/ui/theme";
import { useEditorRecord } from "../shared/use-editor-record";
import { useRelativeTime, joinMeta } from "../shared/record-bits";
import { useNoteDraftWriter } from "./use-note-draft-writer";
import { MessageText } from "@/ui/message-text";
import { useSheetGuard } from "@/ui/sheet-guard";
import {
  ActionMenu,
  Body,
  Button,
  Card,
  ErrorNotice,
  FieldError,
  Heading,
  IconButton,
  Notice,
  PressableArea,
  QueryState,
  Row,
} from "@/ui/primitives";
import { DocumentTitleInput, MarkdownFormatBar, MarkdownTextEditor, type MarkdownEditorHandle } from "@/ui/markdown-editor";
import { TagChipsField } from "@/ui/tag-chips-field";
import { useCopy } from "@/ui/copy";
import { showToast } from "@/ui/toast";
import { useClipboardFeedback } from "@/ui/use-clipboard-feedback";
import { iconSize, metrics, radii, space } from "@/ui/tokens";
import { AppState } from "@/state/app-state";
import { useHostQuery } from "@/state/queries";
import { useFormDraft } from "@/state/form-draft";
import type { Note } from "@/domain/types";
import type { LocalNoteDraft } from "../note-drafts";
import type { ExistingNoteProps, NoteEditorProps } from "./types";
import { noteTags, noteTagIssue, noteTitleTooLong } from "./note-tags";
import { createNoteAutosave, sameNoteContent, type NoteAutosaveState } from "./note-autosave";
import { useActiveMachine } from "@/state/machines";
import { identifier } from "../shared/format";
import { RecordConfirmationSheet, useRecordConfirmation } from "../shared/use-record-confirmation";

/** The computer refuses a write whose base revision is no longer the note's current one. */
const isNoteConflict = (error: unknown) =>
  error instanceof Error && /changed on the computer/i.test(error.message);

export function ExistingNote({ id, ...props }: ExistingNoteProps) {
  useMobileTheme();
  const query = useHostQuery<Note | null>(["notes", "detail", id], "notes.get", { id });
  useSheetGuard({ pending: props.remove.isPending });
  const copy = useCopy();
  const note = useEditorRecord(id, query.data ?? undefined);
  if (!note)
    return (
      <View style={{ padding: space.screen }}>
        <Card>
          <QueryState
            query={query}
            empty={query.data === null}
            emptyTitle={copy("Not bulunamadı.", "Note not found.")}
          />
          <Button
            label={copy("Kapat", "Close")}
            disabled={props.remove.isPending}
            onPress={() => {
              if (!props.remove.isPending) props.onClose();
            }}
          />
        </Card>
      </View>
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

type Mode = "edit" | "read";
type HeaderStatus = { label: string; danger?: boolean } | null;
type HeaderHandlers = { toggle: () => void; close: () => void; copy: () => void; remove: () => void };

/**
 * The open note's header: a quiet save status, one Read/Edit toggle, the note
 * menu (copy, delete) and Close. Notes save automatically, so there is no Save.
 */
function NoteEditorHeader({
  status,
  mode,
  canCopy,
  canDelete,
  deleting,
  handlers,
}: {
  status: HeaderStatus;
  mode: Mode;
  canCopy: boolean;
  canDelete: boolean;
  deleting: boolean;
  handlers: { current: HeaderHandlers };
}) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexShrink: 1 }}>
      {status ? (
        <Body
          accessibilityLiveRegion="polite"
          numberOfLines={1}
          style={[uiStyles.caption, { flexShrink: 1, marginEnd: space.xs, color: status.danger ? colors.danger : colors.muted }]}
        >
          {status.label}
        </Body>
      ) : null}
      <IconButton
        label={mode === "edit" ? copy("Oku", "Read") : copy("Düzenle", "Edit")}
        reserveTouchTarget
        disabled={deleting}
        onPress={() => handlers.current.toggle()}
      >
        {mode === "edit" ? (
          <Eye size={iconSize.action} strokeWidth={1.8} color={colors.text} />
        ) : (
          <Pencil size={iconSize.action} strokeWidth={1.8} color={colors.text} />
        )}
      </IconButton>
      <ActionMenu
        label={copy("Diğer işlemler", "More actions")}
        reserveTouchTarget
        busy={deleting}
        onTriggerPress={() => Keyboard.dismiss()}
        actions={[
          {
            key: "copy",
            label: copy("Notu kopyala", "Copy note"),
            icon: <CopyIcon size={iconSize.action} />,
            disabled: !canCopy || deleting,
            onPress: () => handlers.current.copy(),
          },
          canDelete && {
            key: "delete",
            label: copy("Notu sil", "Delete note"),
            icon: <Trash2 size={iconSize.action} />,
            destructive: true,
            reviewed: true,
            disabled: deleting,
            onPress: () => handlers.current.remove(),
          },
        ]}
      />
      <IconButton label={copy("Kapat", "Close")} reserveTouchTarget disabled={deleting} onPress={() => handlers.current.close()}>
        <View
          style={{
            width: metrics.visualControl - 2,
            height: metrics.visualControl - 2,
            borderRadius: radii.pill,
            backgroundColor: colors.fill,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={16} strokeWidth={2.6} color={colors.muted} />
        </View>
      </IconButton>
    </View>
  );
}

/**
 * A full-page note: large wrapping title, quiet metadata, tag chips and a
 * live-styled markdown body with a formatting bar on the keyboard. Edits are
 * kept on the phone at once and written to the computer after a short pause.
 */
export function NoteEditor({
  initial,
  unsaved = false,
  save,
  remove,
  draftOwner,
  onClose,
  setHeader,
  projectLabel,
  onReopen,
}: NoteEditorProps) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const relative = useRelativeTime();
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
  const [mode, setMode] = useState<Mode>(() =>
    !unsaved && base.expectedUpdatedAt > 0 && base.body.trim() ? "read" : "edit",
  );
  const [focused, setFocused] = useState<"title" | "body" | "tags" | null>(null);
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const titleInput = useRef<TextInputInstance>(null);
  const body = useRef<MarkdownEditorHandle>(null);
  const titleFocused = useRef(false);
  const titleEdited = useRef(false);
  const { writer, state: draftWrite } = useNoteDraftWriter(draftOwner);
  const [saveState, setSaveState] = useState<NoteAutosaveState>({ status: "idle" });
  const [updatedAt, setUpdatedAt] = useState(unsaved ? 0 : base.expectedUpdatedAt);
  const saveRef = useRef(save);
  saveRef.current = save;
  // The draft last handed to the phone store; removed once the computer has the same content.
  const written = useRef<LocalNoteDraft | null>(unsaved ? base : null);
  const [autosave] = useState(() =>
    createNoteAutosave({
      initial: base,
      // A new note or recovered draft is not on the computer until its first write.
      baseline: unsaved ? { ...base, title: "", body: "", tags: "" } : base,
      write: (params) => saveRef.current.mutateAsync(params),
      notify: setSaveState,
      onSaved: (saved, at) => {
        setUpdatedAt(at);
        const stored = written.current;
        if (stored && sameNoteContent(stored, saved)) void writer.clear(stored).catch(() => {});
      },
    }),
  );
  // Two patches in one tick must both reach storage, so merge into the newest draft, not the rendered one.
  const newest = useRef(draft);
  const valid = (next: LocalNoteDraft) => !noteTagIssue(noteTags(next.tags)) && !noteTitleTooLong(next.title);
  const scheduleSave = (finalize = false) => {
    const next = newest.current;
    // Invalid content stays on the phone; the computer would silently cut it.
    if (!valid(next)) return;
    // A new note gets its lasting link name from the title, so it waits until the title is finished.
    const hold = autosave.expectedUpdatedAt === 0 && titleFocused.current;
    autosave.schedule(next, { hold, finalize: finalize && titleEdited.current });
  };
  const update = (patch: Partial<LocalNoteDraft>) => {
    newest.current = { ...newest.current, ...patch, expectedUpdatedAt: autosave.expectedUpdatedAt };
    if ("title" in patch) titleEdited.current = true;
    form.patch(patch);
    written.current = newest.current;
    writer.schedule(newest.current);
    scheduleSave();
  };
  const commitTitle = () => {
    titleFocused.current = false;
    scheduleSave(true);
  };
  // A recovered draft goes to the computer as soon as it is reopened.
  useEffect(() => {
    if (unsaved) scheduleSave();
  }, []);
  // Effect: leaving the app or closing the note writes the last edit (desktop saves on unmount too).
  const flushOnExit = useEffectEvent(() => {
    titleFocused.current = false;
    scheduleSave(true);
    void autosave.flush().catch(() => {});
  });
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") flushOnExit();
    });
    return () => {
      subscription.remove();
      flushOnExit();
    };
  }, []);

  // The computer cuts what is too long, so invalid content is never sent and is unsaved by definition.
  const invalid = !!tagIssue || titleTooLong;
  const failed = saveState.status === "error";
  const deleting = remove.isPending;
  const { requestClose } = useSheetGuard({
    // Closing keeps the phone draft, but an edit the computer refused or cannot take must be confirmed.
    dirty: invalid || (failed && autosave.unsaved),
    pending: deleting,
    onClose,
  });
  const clipboard = useClipboardFeedback(draft.body, !deleting && !!draft.body.trim());
  const announceCopy = useEffectEvent((failure: boolean) =>
    showToast(
      failure
        ? { tone: "danger", message: copy("Kopyalanamadı. Yeniden deneyin.", "Could not copy. Try again.") }
        : { message: copy("Kopyalandı", "Copied") },
    ),
  );
  // Reason: the menu closes on press, so the copy result needs feedback outside it.
  useEffect(() => {
    if (clipboard.copied) announceCopy(false);
    else if (clipboard.error) announceCopy(true);
  }, [clipboard.copied, clipboard.error]);

  // The same reviewed-record confirmation as the notes list: a change while it is open is reported.
  const { confirm, review } = useRecordConfirmation(
    { id: draft.id, title: draft.title.trim() || copy("Başlıksız", "Untitled"), status: "", updatedAt },
    machine?.name || copy("Bağlı bilgisayar", "Connected computer"),
    deleting,
  );
  const deleteNote = () =>
    confirm(
      copy("Notu sil", "Delete note"),
      copy(
        "Bu not bilgisayardan kalıcı olarak silinecek.",
        "This note will be permanently deleted from the computer.",
      ),
      copy("Sil", "Delete"),
      () => {
        // Pending edits would recreate the note, so writing stops before the delete is sent.
        void autosave.pause().then(() =>
          remove.mutate(
            { id: draft.id, expectedUpdatedAt: autosave.expectedUpdatedAt },
            {
              onSuccess: () => {
                void writer.clear(newest.current).catch(() => {});
                onClose();
              },
              onError: () => {
                autosave.resume();
                scheduleSave();
              },
            },
          ),
        );
      },
    );
  const conflict = failed && isNoteConflict(saveState.error);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<unknown>();
  // The phone draft stays until the computer has it, so leaving for the current version loses nothing.
  const openCurrent = () => {
    if (!onReopen) return;
    void autosave.pause().then(() => onReopen(draft.id));
  };
  const saveAsCopy = () => {
    if (copying) return;
    setCopying(true);
    setCopyError(undefined);
    const mine = newest.current;
    const suffix = ` (${copy("kopya", "copy")})`;
    const title = mine.title.trim() ? Array.from(mine.title).slice(0, 200 - suffix.length).join("") + suffix : "";
    const id = identifier();
    void autosave
      .pause()
      .then(() =>
        save.mutateAsync({
          note: {
            id,
            title,
            body: mine.body,
            tags: noteTags(mine.tags),
            ...(mine.sourceCwd ? { sourceCwd: mine.sourceCwd } : {}),
          },
          expectedUpdatedAt: 0,
        }),
      )
      .then(async () => {
        await writer.clear(mine).catch(() => {});
        if (onReopen) onReopen(id);
        else onClose();
      })
      .catch((error: unknown) => {
        autosave.resume();
        setCopyError(error);
      })
      .finally(() => setCopying(false));
  };
  // Tapping the read view starts editing with the cursor in the body.
  const focusBody = useRef(false);
  useEffect(() => {
    if (mode === "edit" && focusBody.current) {
      focusBody.current = false;
      body.current?.focus();
    }
  }, [mode]);
  const handlers = useRef<HeaderHandlers>(null!);
  handlers.current = {
    toggle: () => {
      if (mode === "edit") {
        Keyboard.dismiss();
        commitTitle();
        setFocused(null);
        setMode("read");
      } else setMode("edit");
    },
    close: () => {
      Keyboard.dismiss();
      requestClose();
    },
    copy: clipboard.copy,
    remove: deleteNote,
  };
  const status: HeaderStatus = failed || invalid
    ? { label: copy("Kaydedilmedi", "Not saved"), danger: true }
    : saveState.status === "pending" || saveState.status === "saving"
      ? { label: copy("Kaydediliyor…", "Saving…") }
      : saveState.status === "saved"
        ? { label: copy("Kaydedildi", "Saved") }
        : null;
  const canDelete = updatedAt > 0 && !!draftOwner;
  const canCopy = !!draft.body.trim() && !clipboard.inFlight;
  useLayoutEffect(() => {
    setHeader(
      <NoteEditorHeader
        status={status}
        mode={mode}
        canCopy={canCopy}
        canDelete={canDelete}
        deleting={deleting}
        handlers={handlers}
      />,
    );
  }, [status?.label, status?.danger, mode, canCopy, canDelete, deleting]);
  useLayoutEffect(() => () => setHeader(undefined), []);

  const project = projectLabel?.(draft.sourceCwd);
  const meta = joinMeta([
    project,
    updatedAt > 0 && copy("{p0} düzenlendi", "Edited {p0}", { p0: relative(updatedAt) }),
  ]);
  const gutter = { paddingHorizontal: space.screen };
  const feedback = (
    <>
      {conflict ? (
        <View style={[gutter, { paddingTop: space.sm, gap: space.xs }]}>
          <Notice
            tone="warning"
            message={copy(
              "Bu not başka bir yerde değişti. Değişiklikleriniz bu telefonda saklı.",
              "This note changed elsewhere. Your changes are kept on this phone.",
            )}
          >
            <Row>
              {onReopen ? (
                <Button
                  tone="quiet"
                  label={copy("Güncel sürümü aç", "Open the current version")}
                  disabled={copying || deleting}
                  onPress={openCurrent}
                />
              ) : null}
              <Button
                tone="primary"
                label={copy("Benimkini kopya olarak kaydet", "Save mine as a copy")}
                busy={copying}
                disabled={deleting}
                onPress={saveAsCopy}
              />
            </Row>
          </Notice>
          <ErrorNotice error={copyError} />
        </View>
      ) : failed ? (
        <View style={[gutter, { paddingTop: space.sm, gap: space.xs }]}>
          <ErrorNotice
            error={saveState.error}
            onRetry={() => void autosave.flush().catch(() => {})}
            retryLabel={copy("Yeniden dene", "Retry")}
          />
          {draftWrite.status === "saved" || draftWrite.status === "idle" ? (
            <Body muted style={uiStyles.caption}>
              {copy("Taslak bu telefonda saklandı.", "Draft saved on this phone.")}
            </Body>
          ) : null}
        </View>
      ) : null}
      {draftWrite.status === "error" ? (
        <View style={[gutter, { paddingTop: space.sm }]}>
          <ErrorNotice
            error={draftWrite.error}
            onRetry={() => void writer.flush().catch(() => {})}
            retryLabel={copy("Taslağı telefona tekrar kaydet", "Retry saving draft on phone")}
          />
        </View>
      ) : null}
    </>
  );

  if (mode === "read")
    return (
      <View style={{ flex: 1 }}>
        {feedback}
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[gutter, { paddingTop: space.sm, paddingBottom: space.xxl, gap: space.md }]}
        >
          <View style={{ gap: space.sm }}>
            <Heading style={[uiStyles.pageTitle, !draft.title.trim() && { color: colors.subtle }]}>
              {draft.title.trim() || copy("Başlıksız", "Untitled")}
            </Heading>
            {meta ? <Body muted style={uiStyles.caption}>{meta}</Body> : null}
            <TagChipsField label={copy("Etiketler", "Tags")} tags={tags} editable={false} />
          </View>
          {titleError ? <FieldError message={titleError} /> : null}
          {tagError ? <FieldError message={tagError} /> : null}
          <PressableArea
            label={copy("Notu düzenle", "Edit note")}
            disabled={deleting}
            onPress={() => {
              focusBody.current = true;
              setMode("edit");
            }}
          >
            {draft.body.trim() ? (
              <MessageText text={draft.body} role="assistant" />
            ) : (
              <Body muted>{copy("Not henüz boş.", "The note is empty.")}</Body>
            )}
          </PressableArea>
        </ScrollView>
        <RecordConfirmationSheet review={review} />
      </View>
    );

  const writing = focused === "body";
  return (
    <View style={{ flex: 1 }}>
      {feedback}
      <View style={[gutter, { paddingTop: space.xs, gap: space.xs }]}>
        <DocumentTitleInput
          ref={titleInput}
          label={copy("Başlık", "Title")}
          placeholder={copy("Başlıksız", "Untitled")}
          value={draft.title}
          error={titleError}
          editable={!deleting}
          autoFocus={unsaved && !base.title && !base.body}
          // While writing the body the title keeps two lines; it scrolls inside itself beyond them.
          style={{ maxHeight: metrics.touchTarget * (writing ? 1.5 : 3) }}
          onChangeText={(title) => update({ title })}
          onSubmit={() => body.current?.focus()}
          onFocus={() => {
            titleFocused.current = true;
            setFocused("title");
          }}
          onBlur={() => {
            commitTitle();
            setFocused((current) => (current === "title" ? null : current));
          }}
        />
        {titleError ? <FieldError message={titleError} /> : null}
        {/* Metadata steps aside while the body is written, leaving the page to the text. */}
        {!writing ? (
          <>
            {meta ? <Body muted style={uiStyles.caption}>{meta}</Body> : null}
            <TagChipsField
              label={copy("Etiketler", "Tags")}
              tags={tags}
              editable={!deleting}
              normalize={(next) => noteTags(next.join(","))}
              onChange={(next) => update({ tags: next.join(", ") })}
            />
            {tagError ? <FieldError message={tagError} /> : null}
          </>
        ) : null}
      </View>
      <MarkdownTextEditor
        ref={body}
        label={copy("Not", "Note")}
        placeholder={copy("Yazmaya başlayın…", "Start writing…")}
        value={draft.body}
        editable={!deleting}
        onChangeText={(next) => update({ body: next })}
        onFocus={() => setFocused("body")}
        onBlur={() => setFocused((current) => (current === "body" ? null : current))}
        style={[gutter, { flex: 1, paddingTop: space.md, paddingBottom: space.xl }]}
      />
      {writing && (keyboardVisible || process.env.EXPO_OS === "web") ? (
        <MarkdownFormatBar disabled={deleting} onApply={(command) => body.current?.apply(command)} />
      ) : null}
      <RecordConfirmationSheet review={review} />
    </View>
  );
}
