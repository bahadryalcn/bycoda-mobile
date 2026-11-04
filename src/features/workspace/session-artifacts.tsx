import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useHostQuery } from "@/state/queries";
import { useLocale } from "@/i18n";
import { View } from "react-native";
import { space } from "@/ui/tokens";
import { matchesSearch, normalizeSearch } from "../management/shared/search";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope, type ConnectionScope } from "@/state/connection-scope";
import { Body, Button, FormActions, NavigationRow, Notice, QueryState, ScreenList, SearchField, Sheet, Stack } from "@/ui/primitives";
import { PrivateContentAccessProvider, usePrivateContentAccess } from "@/ui/private-access";
import { useFilteredListScrollMemory } from "@/ui/use-list-scroll-memory";
import { useCopy } from "@/ui/copy";
import type { HtmlArtifact, HtmlArtifactSummary } from "@/remote/types";
import { readArtifact, readArtifactList } from "./artifact-model";
import { ArtifactReader } from "./artifact-reader";

type Scope = { projectId: string; sessionId: string; messageId?: string };
export function SessionArtifacts(props: Scope) {
  const machine = useActiveMachine(), connection = useConnectionScope();
  return <ArtifactScope key={JSON.stringify([connection.token, machine?.id, props.projectId, props.sessionId, props.messageId])} {...props} connection={connection} />;
}

function ArtifactScope({ projectId, sessionId, messageId, connection }: Scope & { connection: ConnectionScope }) {
  const locale = useLocale(), [search, setSearch] = useState("");
  const searchKey = normalizeSearch(search, locale);
  const copy = useCopy(), machine = useActiveMachine(), access = usePrivateContentAccess();
  const [opening] = useState(() => ({ machineId: machine?.id, machineName: machine?.name ?? machine?.id ?? "", projectId, sessionId, messageId, connection }));
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<HtmlArtifactSummary | null>(null);
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const scopeCurrent = connection === opening.connection && connection.isCurrent() && machine?.id === opening.machineId && useMachines.getState().activeId === opening.machineId;
  const supported = scopeCurrent && !!machine?.capabilities?.includes("html.artifacts");
  const available = scopeCurrent && access.allowed && access.check();
  const live = useRef({ open, selected, available, access, supported }); live.current = { open, selected, available, access, supported };
  const originCurrent = () => mounted.current && live.current.available && opening.connection.isCurrent() && useMachines.getState().activeId === opening.machineId && live.current.access.allowed && live.current.access.check();
  const current = () => originCurrent() && live.current.supported && !!useMachines.getState().machines.find(item => item.id === opening.machineId)?.capabilities?.includes("html.artifacts");
  const assertCurrent = () => { if (!current()) throw new Error("The original artifact connection is unavailable."); };
  const list = useHostQuery<HtmlArtifactSummary[]>(["artifacts", projectId, sessionId], "html.artifacts.list", { projectId, sessionId }, {
    enabled: available && supported && (open || !!messageId),
    queryFn: async (client, signal) => { assertCurrent(); const value = await client.request<unknown>("html.artifacts.list", { projectId, sessionId }, { signal }); assertCurrent(); return readArtifactList(value, sessionId); },
  });
  const hidden = useRef({ list: false, detail: false, id: selected?.id });
  if (hidden.current.id !== selected?.id) { hidden.current.id = selected?.id; hidden.current.detail = false; }
  const listKind = (list.error as { kind?: string } | null)?.kind;
  if (listKind === "auth" || listKind === "identity") hidden.current.list = true;
  else if (list.isSuccess && !list.error && !list.isFetching) hidden.current.list = false;
  const listReadable = available && supported && list.isEnabled !== false && list.fetchStatus !== "paused" && !hidden.current.list;
  const detail = useHostQuery<HtmlArtifact>(["artifact", projectId, sessionId, selected?.id], "html.artifacts.read", { projectId, sessionId, id: selected?.id }, {
    enabled: listReadable && open && !!selected,
    queryFn: async (client, signal) => {
      assertCurrent(); if (!selected || !live.current.open || live.current.selected !== selected) throw new Error("The selected artifact changed.");
      const value = await client.request<unknown>("html.artifacts.read", { projectId, sessionId, id: selected.id }, { signal });
      assertCurrent(); if (!live.current.open || live.current.selected !== selected) throw new Error("The selected artifact changed.");
      const result = readArtifact(value, sessionId, selected.id);
      if (messageId && result.messageId !== messageId) throw new Error("The selected artifact changed.");
      return result;
    },
  });
  const detailKind = (detail.error as { kind?: string } | null)?.kind;
  if (detailKind === "auth" || detailKind === "identity") hidden.current.detail = true;
  else if (detail.isSuccess && !detail.error && !detail.isFetching) hidden.current.detail = false;
  const readable = listReadable && detail.isEnabled !== false && detail.fetchStatus !== "paused" && !hidden.current.detail;
  const items = useMemo(() => listReadable ? messageId ? list.data?.filter(item => item.messageId === messageId) ?? [] : list.data ?? [] : [], [listReadable, list.data, messageId]);
  const rows = useMemo(() => items.filter(item => matchesSearch(`${item.title}\n${item.id}`, search, locale)), [items, search, locale]);
  const lease = useMemo(() => ({ active: false }), [searchKey, open, selected, available, listReadable, list.data, readable, detail.data]);
  useLayoutEffect(() => { lease.active = true; return () => { lease.active = false; }; }, [lease]);
  useLayoutEffect(() => { if (!available || !supported) { live.current.selected = null; live.current.open = false; setSelected(null); setOpen(false); } }, [available, supported]);
  const show = () => { if (lease.active && originCurrent()) { live.current.open = true; setOpen(true); } };
  const choose = (item: HtmlArtifactSummary) => { if (lease.active && current() && live.current.open && !live.current.selected && listReadable && rows.includes(item)) { live.current.selected = item; setSelected(item); } };
  const close = () => { if (!mounted.current || !lease.active) return; live.current.selected = null; live.current.open = false; setSelected(null); setOpen(false); };
  const back = () => { if (mounted.current && lease.active) { live.current.selected = null; setSelected(null); } };
  const inputLease = useMemo(() => ({ active: false }), [open, selected, listReadable]);
  useLayoutEffect(() => { inputLease.active = true; return () => { inputLease.active = false; }; }, [inputLease]);
  const changeSearch = (value: string) => { if (inputLease.active && current() && live.current.open && !live.current.selected && listReadable) setSearch(value); };
  const clearSearch = () => { if (lease.active) changeSearch(""); };
  const position = useFilteredListScrollMemory<HtmlArtifactSummary>(searchKey, open && !selected && listReadable && !!list.data, rows.length, { suspended: !open || !!selected || !listReadable });
  const listPresentation = { ...list, data: listReadable ? list.data : undefined, refetch: async () => { if (lease.active && current() && live.current.open && list.isEnabled !== false) await list.refetch(); } };
  const detailPresentation = { ...detail, data: readable && detail.data?.id === selected?.id && detail.data?.sessionId === sessionId && (!messageId || detail.data.messageId === messageId) ? detail.data : undefined, refetch: async () => { if (lease.active && current() && live.current.open && live.current.selected === selected && detail.isEnabled !== false) await detail.refetch(); } };
  const readerQuery = listReadable ? detailPresentation : listPresentation;
  const readerUnavailable = (!readable || !!detail.data && !detailPresentation.data) && !readerQuery.error && readerQuery.fetchStatus !== "paused";
  const presentationAccess = useMemo(() => ({ allowed: available, check: originCurrent }), [available, access, lease]);
  const unavailable = <Notice message={copy("Kayıt erişimi kullanılamıyor. İlk bilgisayar ve proje bağlantısını kontrol edin.", "Record access is unavailable. Check the original computer and project connection.")} />;
  const trigger = messageId && (!supported || !items.length) ? null : <Button density="compact" tone="quiet" disabled={!available} label={supported ? copy("Görseller ({p0})", "Artifacts ({p0})", { p0: listReadable && list.data ? items.length : "…" }) : copy("Kaydedilen görseller", "Saved artifacts")} onPress={show} />;
  return <>{trigger}<PrivateContentAccessProvider value={presentationAccess}>{open && selected ? <ArtifactReader
    artifact={detailPresentation.data} summary={selected} machineName={opening.machineName} query={readerQuery} unavailable={readerUnavailable} onBack={back} />
  : <Sheet visible={open} title={copy("Kaydedilen görseller", "Saved artifacts")} size="full" scroll={!available || !supported} onClose={close}
    footer={<FormActions tone="quiet" submitLabel={copy("Kapat", "Close")} onSubmit={close} />}>
    {!available ? unavailable : !supported ? <Notice message={copy("Bu bilgisayar kaydedilmiş HTML görsellerini paylaşmayı desteklemiyor. Çalışma alanına kaydedilen HTML dosyalarını Dosyalar’dan açabilirsin.", "This computer does not support sharing saved HTML artifacts. Open HTML files saved in the workspace from Files.")} /> : <View style={{ flex: 1, minHeight: 0 }}><Stack style={{ paddingHorizontal: space.screen }}><Body selectable>{opening.machineName}</Body><SearchField label={copy("Yüklenen kayıtlarda ara", "Search loaded records")} value={listReadable ? search : ""} editable={listReadable} maxLength={200} onChangeText={changeSearch} /></Stack><ScreenList {...position.listProps} data={rows} query={listPresentation} keyExtractor={item => item.id}
      header={<Stack><QueryState query={listPresentation} empty={listReadable && list.isSuccess && !rows.length} emptyTitle={searchKey ? copy("Eşleşen sonuç yok", "No matching results") : copy("Bu oturumda kaydedilmiş görsel yok.", "No saved artifacts in this session.")} emptyAction={searchKey ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch } : undefined} />{!listReadable && !list.error && list.fetchStatus !== "paused" ? unavailable : null}</Stack>}
      renderItem={({ item }) => <NavigationRow label={item.title} labelLines={2} detail={new Date(item.createdAt).toLocaleDateString()} onPress={() => choose(item)} />} /></View>}
  </Sheet>}</PrivateContentAccessProvider></>;
}
