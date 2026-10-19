import { useEffect, useRef, useState } from "react";
import Pencil from "lucide-react-native/icons/pencil";
import {
  Body,
  Button,
  ConfirmationCard,
  ErrorText,
  Input,
  Loading,
  Row,
  Sheet,
} from "@/ui/primitives";
import { ChatSummary } from "@/ui/chat-controls";
import { useCopy } from "@/ui/copy";
import { uiStyles } from "@/ui/styles";
import { useMobileTheme } from "@/ui/theme";
import { colors } from "@/ui/tokens";
import type { QueuedMessage } from "../../../../src/features/sessions/model/session";
import type { SessionScope } from "./session-types";
import type { useSessionQueue } from "./use-session-queue";
import { useLocalDraft } from "./use-local-draft";
import { registerWorkspaceDraft } from "./draft-guard";
import {
  beginQueuedMessageEdit,
  decodeQueuedMessageEdit,
  encodeQueuedMessageEdit,
  queuedEditWasSaved,
  releaseQueuedMessageEdit,
  saveQueuedMessageEdit,
} from "./composer-queue-edit";
import { queueEditDraftKey } from "./queue-attachment-ownership";
import { composerDeliveryError } from "./composer-delivery-copy";

export function useQueueEditor(
  scope: SessionScope,
  queue: ReturnType<typeof useSessionQueue>,
  blocked: boolean,
) {
  const draftKey = queueEditDraftKey(scope.machineId, scope.sessionId);
  const draft = useLocalDraft(draftKey, decodeQueuedMessageEdit, encodeQueuedMessageEdit);
  const [visible, setVisible] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pending = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(
    () =>
      draft.ready && !draft.isStored
        ? registerWorkspaceDraft(draftKey, () => draft.persist())
        : undefined,
    [draft.ready, draft.isStored, draftKey, draft.persist],
  );
  const perform = async (action: () => Promise<void>, allowBlocked = false) => {
    if (pending.current || (blocked && !allowBlocked)) return;
    pending.current = true;
    setWorking(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      if (active.current) setError(cause);
    } finally {
      pending.current = false;
      if (active.current) setWorking(false);
    }
  };
  const clear = async () => {
    // Persist deletion first. If storage fails, keep the recoverable text on screen.
    await draft.persist(null);
    draft.setValue(null);
    void queue.persistedEdit().catch(() => {});
    if (active.current) setVisible(false);
  };
  return {
    ...draft,
    visible,
    working,
    editError: error,
    available: draft.ready && !draft.value && !draft.error && !working,
    hide: () => {
      void perform(async () => {
        if (draft.ready) await draft.persist();
        if (active.current) setVisible(false);
      }, true);
    },
    open: (row?: QueuedMessage) => {
      setVisible(true);
      void perform(async () => {
        if (!draft.ready || draft.error) return;
        if (row && draft.valueRef.current) return;
        const edit = row
          ? { version: 1 as const, original: row, text: row.text, owner: queue.clientId }
          : draft.valueRef.current;
        if (!edit) return;
        await queue.retainEdit(edit.original);
        if (row) {
          draft.setValue(edit);
          await draft.persist(edit);
          void queue.persistedEdit().catch(() => {});
        }
        await queue.change((value) => beginQueuedMessageEdit(value, edit, queue.clientId), true);
        const owned = { ...edit, owner: queue.clientId };
        draft.setValue(owned);
        await draft.persist(owned);
        void queue.persistedEdit().catch(() => {});
      });
    },
    save: () => {
      void perform(async () => {
        const edit = draft.valueRef.current;
        if (!edit) return;
        await draft.persist(edit);
        try {
          await queue.change((value) => saveQueuedMessageEdit(value, edit, queue.clientId));
        } catch (cause) {
          // Reconcile a lost acknowledgement with a read; never replay the write.
          const latest = await queue.refetch();
          if (
            latest.error ||
            !latest.data ||
            latest.data.editingId === edit.original.id ||
            !queuedEditWasSaved(latest.data, edit)
          )
            throw cause;
        }
        await clear();
      });
    },
    reload: () => {
      void perform(async () => {
        const id = draft.valueRef.current?.original.id;
        if (!id) return;
        const latest = await queue.refetch();
        if (latest.error) throw latest.error;
        const original = latest.data?.messages.find((row) => row.id === id);
        if (!original)
          throw new Error(
            "This queued message is no longer available. Your edit is kept on this device.",
          );
        await queue.retainEdit(original);
        const edit = {
          version: 1 as const,
          original,
          text: original.text,
          owner: draft.valueRef.current?.owner,
        };
        await queue.change((value) => beginQueuedMessageEdit(value, edit, queue.clientId), true);
        const owned = { ...edit, owner: queue.clientId };
        await draft.persist(owned);
        void queue.persistedEdit().catch(() => {});
        draft.setValue(owned);
      });
    },
    discard: () => {
      void perform(async () => {
        const edit = draft.valueRef.current;
        if (edit)
          await queue.change((value) =>
            releaseQueuedMessageEdit(value, edit.original.id, queue.clientId),
          );
        await clear();
      });
    },
  };
}

export function SessionQueueEditor({
  editor,
  blocked,
}: {
  editor: ReturnType<typeof useQueueEditor>;
  blocked: boolean;
}) {
  useMobileTheme();
  const copy = useCopy();
  const [confirmReload, setConfirmReload] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useEffect(() => {
    if (!editor.visible) {
      setConfirmReload(false);
      setConfirmDiscard(false);
    }
  }, [editor.visible]);
  const edit = editor.value;
  const disabled = blocked || editor.working;
  return (
    <>
      {edit || editor.error ? (
        <ChatSummary
          label={copy("Sıradaki mesajın taslağı", "Queued message draft")}
          detail={copy("Düzenlemeye devam et", "Continue editing")}
          icon={<Pencil size={18} color={colors.accent} />}
          onPress={() => editor.open()}
        />
      ) : null}
      <Sheet
        visible={editor.visible}
        title={copy("Sıradaki mesajı düzenle", "Edit queued message")}
        dismissible={!editor.working}
        onClose={editor.hide}
        size="form"
      >
        {!editor.ready && !editor.error ? <Loading /> : null}
        <ErrorText
          error={editor.error || editor.editError}
          message={composerDeliveryError(editor.error || editor.editError, copy)}
        />
        {editor.error ? (
          <Button
            label={copy("Taslağı yeniden yükle", "Retry loading draft")}
            onPress={() => {
              void editor.load();
            }}
          />
        ) : null}
        {edit ? (
          <>
            <Body muted style={uiStyles.caption}>
              {copy(
                "Ekler ve özgün model ayarları korunur.",
                "Attachments and original model settings are preserved.",
              )}
            </Body>
            {edit.original.modelTarget ? (
              <Body muted style={uiStyles.caption}>
                {edit.original.modelTarget.model}
              </Body>
            ) : null}
            <Input
              label={copy("Mesaj", "Message")}
              value={edit.text}
              multiline
              editable={!disabled}
              onChangeText={(text) =>
                editor.setValue((current) => (current ? { ...current, text } : current))
              }
            />
            {edit.original.attachments.map((file) => (
              <Body key={file.id} muted selectable style={uiStyles.caption}>
                {file.name} · {Math.ceil(file.size / 1024)} KB
              </Body>
            ))}
            <Row>
              <Button
                label={copy("Değişiklikleri kaydet", "Save changes")}
                onPress={editor.save}
                busy={editor.working}
                disabled={blocked}
              />
              <Button
                label={copy("Sıradaki güncel mesajı yükle", "Reload latest queued message")}
                tone="quiet"
                onPress={() => setConfirmReload(true)}
                disabled={disabled}
              />
              <Button
                label={copy("Düzenlemeyi sil", "Discard edit")}
                tone="quiet"
                onPress={() => setConfirmDiscard(true)}
                disabled={disabled}
              />
            </Row>
            {confirmReload ? (
              <ConfirmationCard
                message={copy(
                  "Bu düzenlemeyi bilgisayardaki güncel mesajla değiştir?",
                  "Replace this edit with the latest message on your computer?",
                )}
                confirmLabel={copy("Güncel mesajı yükle", "Load latest message")}
                cancelLabel={copy("Vazgeç", "Cancel")}
                tone="primary"
                onCancel={() => setConfirmReload(false)}
                onConfirm={() => {
                  setConfirmReload(false);
                  editor.reload();
                }}
                disabled={disabled}
              />
            ) : null}
            {confirmDiscard ? (
              <ConfirmationCard
                message={copy(
                  "Bu düzenlemeyi sil? Sıradaki özgün mesaj korunur.",
                  "Discard this edit? The original queued message is kept.",
                )}
                confirmLabel={copy("Düzenlemeyi sil", "Discard edit")}
                cancelLabel={copy("Vazgeç", "Cancel")}
                onCancel={() => setConfirmDiscard(false)}
                onConfirm={() => {
                  setConfirmDiscard(false);
                  editor.discard();
                }}
                disabled={disabled}
              />
            ) : null}
          </>
        ) : null}
      </Sheet>
    </>
  );
}
