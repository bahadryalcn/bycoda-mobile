import { useEffect, useRef, useState } from "react";
import type { QueuedMessage } from "../../../../src/features/sessions/model/session";
import type { SessionScope } from "./session-types";
import type { useSessionQueue } from "./use-session-queue";
import { useLocalDraft } from "./use-local-draft";
import { registerWorkspaceDraft } from "./draft-guard";
import { beginQueuedMessageEdit, decodeQueuedMessageEdit, encodeQueuedMessageEdit, queuedEditWasSaved, releaseQueuedMessageEdit, saveQueuedMessageEdit } from "./composer-queue-edit";
import { queueEditDraftKey } from "./queue-attachment-ownership";
export { SessionQueueEditor } from "./session-queue-editor-view";

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

