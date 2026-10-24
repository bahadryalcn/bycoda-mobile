import { useRef, useState } from "react";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { Body, Button, Notice, QueryState, ScreenList, Sheet } from "@/ui/primitives";
import { MessageText } from "@/ui/message-text";
import { useCopy } from "@/ui/copy";
import type { Note } from "@/domain/types";
import { NoteSummaryRow } from "../management/notes/note-summary-row";
import { readSessionNote, readSessionNotes } from "./session-notes-model";
import type { SessionScope } from "./session-types";
import { useComposerTransfer } from "./composer-transfer";
import { readNoteContext } from "../../../../src/features/notes/noteContext";

/** Read-only session association; opening notes never edits or sends their content. */
export function SessionNotes({ scope, projectId, onClose }: { scope: SessionScope; projectId: string; onClose: () => void }) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const supported = machine?.id === scope.machineId && !!machine.capabilities?.includes("notes.sessionFilter.v1");
  const [selected, setSelected] = useState<string | null>(null);
  const bridge = useComposerTransfer();
  const [transferError, setTransferError] = useState(false);
  const transferring = useRef(false);
  const list = useHostQuery(["notes", "session", projectId, scope.sessionId], "notes.list", {}, {
    enabled: supported,
    queryFn: async (client, signal) => readSessionNotes(await client.request("notes.list", { projectId, sessionId: scope.sessionId }, { signal }), scope.sessionId),
  });
  const detail = useHostQuery(["notes", "session-detail", projectId, scope.sessionId, selected], "notes.get", {}, {
    enabled: supported && !!selected,
    queryFn: async (client, signal) => readSessionNote(await client.request("notes.get", { id: selected, projectId, sessionId: scope.sessionId }, { signal }), scope.sessionId, selected!),
  });
  const close = () => selected ? setSelected(null) : onClose();
  const contextAction = selected && supported && detail.data && bridge && machine?.capabilities?.includes("sessions.noteContext.v1") ? <Button
        label={copy("Bağlam olarak ekle", "Add as context")} disabled={detail.isFetching || !!detail.error}
        onPress={() => {
          if (transferring.current || !detail.data || detail.data.id !== selected || detail.isFetching || detail.error) return;
          transferring.current = true;
          try {
            const { id, slug, title, body, sourceCwd } = detail.data;
            bridge.transfer({ ...scope, text: "", noteCard: readNoteContext({ id, slug, title, body, ...(sourceCwd ? { sourceCwd } : {}) }) });
            onClose();
          } catch { setTransferError(true); transferring.current = false; }
        }} /> : null;
  return <Sheet visible title={copy("Oturum notları", "Session notes")} size="full" scroll={!!selected || !supported} onClose={close} footer={contextAction}>
    {!supported ? <Notice message={copy("Oturum notlarını görmek için bilgisayardaki bycoda’yı güncelleyin.", "Update bycoda on this computer to view session notes.")} /> : selected ? <>
      <Button tone="quiet" label={copy("Geri", "Back")} onPress={() => { setSelected(null); setTransferError(false); }} />
      <QueryState query={detail} empty={detail.data === null} emptyTitle={copy("Not bulunamadı.", "Note not found.")} />
      {supported && detail.data ? <><Body>{detail.data.title}</Body><MessageText text={detail.data.body} /></> : null}
      {transferError ? <Notice tone="warning" message={copy("Not eklenemedi. Not en fazla 64.000 karakter olmalı ve etkin oturumdaki mesaj alanı hazır olmalı.", "The note could not be added. It must fit within 64,000 characters and the active session’s composer must be ready.")} /> : null}
    </> : <ScreenList<Note> data={supported ? list.data?.notes ?? [] : []} query={list} keyExtractor={(note) => note.id}
      header={<>
        <Body>{machine?.name}</Body>
        <QueryState query={list} empty={list.isSuccess && !list.data?.notes.length} emptyTitle={copy("Henüz not yok", "No notes yet")} />
        {supported && list.data && list.data.total > list.data.notes.length ? <Notice message={copy("En son 500 not gösteriliyor.", "Showing the latest 500 notes.")} /> : null}
      </>}
      renderItem={({ item }) => <NoteSummaryRow note={item} disabled={!supported} onPress={() => setSelected(item.id)} />} />}
  </Sheet>;
}
