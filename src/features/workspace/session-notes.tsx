import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { useHostQuery } from "@/state/queries";
import { useLocale } from "@/i18n";
import { View } from "react-native";
import { metrics, space } from "@/ui/tokens";
import { matchesSearch, normalizeSearch } from "../management/shared/search";
import { Body, FormActions, Notice, QueryState, ScreenList, SearchField, Sheet, Stack } from "@/ui/primitives";
import { PrivateContentAccessProvider, usePrivateContentAccess } from "@/ui/private-access";
import { useFilteredListScrollMemory } from "@/ui/use-list-scroll-memory";
import { MessageText } from "@/ui/message-text";
import { useCopy } from "@/ui/copy";
import type { Note } from "@/domain/types";
import { NoteSummaryRow } from "../management/notes/note-summary-row";
import { readSessionNote, readSessionNotes } from "./session-notes-model";
import type { SessionScope } from "./session-types";
import { useComposerTransfer } from "./composer-transfer";
import { readNoteContext } from "../../../../src/features/notes/noteContext";
import { FeatureUnavailable, RecordAccessUnavailable } from "./unavailable-state";

/** Read-only notes; only the mounted composer owns insertion and draft persistence. */
export function SessionNotes({ scope, projectId, onClose }: { scope: SessionScope; projectId: string; onClose: () => void }) {
  const locale = useLocale(), [search, setSearch] = useState("");
  const searchKey = normalizeSearch(search, locale);
  const copy = useCopy(), machine = useActiveMachine(), connection = useConnectionScope(), access = usePrivateContentAccess();
  const [opening] = useState(() => ({ scope: { ...scope }, projectId, connection, machineName: machine?.name ?? machine?.id ?? "" }));
  const target = opening.scope, bridge = useComposerTransfer();
  const mounted = useRef(false), transferring = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const scopeCurrent = connection === opening.connection && opening.connection.isCurrent() &&
    useMachines.getState().activeId === target.machineId && machine?.id === target.machineId &&
    scope.machineId === target.machineId && scope.sessionId === target.sessionId && projectId === opening.projectId;
  const supported = scopeCurrent && !!machine?.capabilities?.includes("notes.sessionFilter.v1");
  const available = scopeCurrent && access.allowed && access.check();
  const [selected, setSelected] = useState<string | null>(null), [transferError, setTransferError] = useState(false);
  const live = useRef({ available, access, selected, supported, bridge, contextSupported: false });
  live.current = { available, access, selected, supported, bridge, contextSupported: !!machine?.capabilities?.includes("sessions.noteContext.v1") };
  const current = () => mounted.current && live.current.available && live.current.supported &&
    opening.connection.isCurrent() && useMachines.getState().activeId === target.machineId && live.current.access.allowed && live.current.access.check() &&
    !!useMachines.getState().machines.find(item => item.id === target.machineId)?.capabilities?.includes("notes.sessionFilter.v1");
  const assertCurrent = () => { if (!current()) throw new Error("The original note connection is unavailable."); };
  const list = useHostQuery(["notes", "session", opening.projectId, target.sessionId], "notes.list", {}, {
    enabled: available && supported,
    queryFn: async (client, signal) => {
      assertCurrent();
      const value = await client.request("notes.list", { projectId: opening.projectId, sessionId: target.sessionId }, { signal });
      assertCurrent(); return readSessionNotes(value, target.sessionId);
    },
  });
  const listKind = (list.error as { kind?: string } | null)?.kind;
  const concealed = useRef({ list: false, detail: false, selected });
  if (concealed.current.selected !== selected) { concealed.current.selected = selected; concealed.current.detail = false; }
  if (listKind === "auth" || listKind === "identity") concealed.current.list = true;
  else if (list.isSuccess && !list.error && !list.isFetching) concealed.current.list = false;
  const listReadable = available && supported && list.isEnabled !== false && list.fetchStatus !== "paused" && !concealed.current.list;
  const detail = useHostQuery(["notes", "session-detail", opening.projectId, target.sessionId, selected], "notes.get", {}, {
    enabled: listReadable && !!selected,
    queryFn: async (client, signal) => {
      assertCurrent();
      const value = await client.request("notes.get", { id: selected, projectId: opening.projectId, sessionId: target.sessionId }, { signal });
      assertCurrent();
      if (!selected || live.current.selected !== selected) throw new Error("The selected note changed.");
      return readSessionNote(value, target.sessionId, selected);
    },
  });
  const detailKind = (detail.error as { kind?: string } | null)?.kind;
  if (detailKind === "auth" || detailKind === "identity") concealed.current.detail = true;
  else if (detail.isSuccess && !detail.error && !detail.isFetching) concealed.current.detail = false;
  const readable = listReadable && detail.isEnabled !== false && detail.fetchStatus !== "paused" && !concealed.current.detail;
  const note = readable && selected && detail.data?.id === selected ? detail.data : null;
  const lease = useMemo(() => ({ active: false }), [searchKey, listReadable, list.data, readable, selected, detail.data, detail.isFetching, detail.error, bridge, live.current.contextSupported]);
  useLayoutEffect(() => { lease.active = true; return () => { lease.active = false; }; }, [lease]);
  // Access loss retires a selected reader; restoring access must not reopen private text.
  useLayoutEffect(() => { if (!listReadable) { live.current.selected = null; setSelected(null); setTransferError(false); } }, [listReadable]);
  const rows = useMemo(() => listReadable ? (list.data?.notes ?? []).filter(item => matchesSearch(`${item.title}\n${item.body}\n${item.tags?.join(" ") ?? ""}\n${item.sourceCwd ?? ""}`, search, locale)) : [], [listReadable, list.data, search, locale]);
  const inputLease = useMemo(() => ({ active: false }), [listReadable, selected]);
  useLayoutEffect(() => { inputLease.active = true; return () => { inputLease.active = false; }; }, [inputLease]);
  const changeSearch = (value: string) => { if (inputLease.active && current() && listReadable && !live.current.selected) setSearch(value); };
  const clearSearch = () => { if (lease.active) changeSearch(""); };
  const position = useFilteredListScrollMemory<Note>(searchKey, listReadable && !!list.data && !selected, rows.length, { suspended: !!selected || !listReadable });
  const open = (item: Note) => {
    if (!lease.active || !current() || !listReadable || live.current.selected || !rows.includes(item)) return;
    live.current.selected = item.id; setSelected(item.id); setTransferError(false);
  };
  const back = () => {
    if (!mounted.current || !lease.active || transferring.current) return;
    live.current.selected = null; setSelected(null); setTransferError(false);
  };
  const close = () => { if (mounted.current && lease.active && !transferring.current) selected ? back() : onClose(); };
  const canTransfer = !!note && !!bridge && live.current.contextSupported;
  const attach = () => {
    if (!lease.active || !current() || transferring.current || !canTransfer || !note ||
      live.current.selected !== selected || live.current.bridge !== bridge || !live.current.contextSupported || detail.isFetching || detail.error ||
      !useMachines.getState().machines.find(item => item.id === target.machineId)?.capabilities?.includes("sessions.noteContext.v1")) return;
    transferring.current = true;
    try {
      const { id, slug, title, body, sourceCwd } = note;
      bridge!.transfer({ ...target, text: "", noteCard: readNoteContext({ id, slug, title, body, ...(sourceCwd ? { sourceCwd } : {}) }) });
      onClose();
    } catch { setTransferError(true); transferring.current = false; }
  };
  const listPresentation = { ...list, data: listReadable ? list.data : undefined, refetch: async () => { if (current() && list.isEnabled !== false) await list.refetch(); } };
  const detailPresentation = { ...detail, data: readable ? detail.data : undefined, refetch: async () => { if (lease.active && current() && live.current.selected === selected && detail.isEnabled !== false) await detail.refetch(); } };
  const unavailable = <RecordAccessUnavailable />;
  return <Sheet visible title={copy("Oturum notları", "Session notes")} size="full" scroll={!!selected || !available || !supported} onClose={close}
    footer={selected ? <FormActions tone={canTransfer ? "primary" : "quiet"} submitLabel={canTransfer ? copy("Bağlam olarak ekle", "Add as context") : copy("Geri", "Back")}
      onSubmit={canTransfer ? attach : close} disabled={canTransfer && (detail.isFetching || !!detail.error)}
      cancelLabel={canTransfer ? copy("Geri", "Back") : undefined} onCancel={canTransfer ? back : undefined}
      feedback={transferError && note ? <Notice tone="warning" message={copy("Not eklenemedi. Not en fazla 64.000 karakter olmalı ve etkin oturumdaki mesaj alanı hazır olmalı.", "The note could not be added. It must fit within 64,000 characters and the active session’s composer must be ready.")} /> : undefined} /> : undefined}>
    {!available ? unavailable : !supported ? <FeatureUnavailable message={copy("Oturum notlarını görmek için bilgisayardaki bycoda’yı güncelleyin.", "Update bycoda on this computer to view session notes.")} /> : selected ? <Stack>
      <Body selectable>{opening.machineName}</Body>
      <QueryState query={detailPresentation} empty={readable && detail.data === null} emptyTitle={copy("Not bulunamadı.", "Note not found.")} />
      {note ? <PrivateContentAccessProvider value={{ allowed: readable, check: () => lease.active && current() }}><Body selectable>{note.title}</Body><MessageText text={note.body} /></PrivateContentAccessProvider> : !readable && !detail.error && detail.fetchStatus !== "paused" ? unavailable : null}
    </Stack> : <View style={{ flex: 1, minHeight: 0, width: "100%", maxWidth: metrics.contentWidth, alignSelf: "center" }}><Stack style={{ paddingHorizontal: space.screen }}><Body selectable>{opening.machineName}</Body><SearchField label={copy("Yüklenen kayıtlarda ara", "Search loaded records")} placeholder={copy("Notlarda ara", "Search notes")} value={listReadable ? search : ""} editable={listReadable} maxLength={200} onChangeText={changeSearch} /></Stack><ScreenList<Note> {...position.listProps} data={rows} query={listPresentation} keyExtractor={item => item.id}
      header={<Stack>
        <QueryState query={listPresentation} empty={listReadable && list.isSuccess && !rows.length} emptyTitle={searchKey ? copy("Eşleşen sonuç yok", "No matching results") : copy("Henüz not yok", "No notes yet")} emptyAction={searchKey ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch } : undefined} />
        {!listReadable ? !list.error && list.fetchStatus !== "paused" ? unavailable : null : list.data && list.data.total > list.data.notes.length ? <Notice message={copy("En son 500 not gösteriliyor.", "Showing the latest 500 notes.")} /> : null}
      </Stack>}
      renderItem={({ item }) => <NoteSummaryRow note={item} labelLines={2} disabled={!listReadable} onPress={() => open(item)} />} /></View>}
  </Sheet>;
}
