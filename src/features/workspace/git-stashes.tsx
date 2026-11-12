import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ArrowLeft from "lucide-react-native/icons/arrow-left";
import ArrowDownToLine from "lucide-react-native/icons/arrow-down-to-line";
import Info from "lucide-react-native/icons/info";
import Plus from "lucide-react-native/icons/plus";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import Trash2 from "lucide-react-native/icons/trash-2";
import { useBackHandler } from "panelui-native/hooks/use-back-handler";
import { useIsFocused } from "expo-router/react-navigation";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { ActionMenu, Body, Field, IconButton, FormActions, MutationState, NavigationRow, Notice, QueryState, Row, ScreenList, SelectField, Sheet } from "@/ui/primitives";
import { CollectionToolbar } from "@/ui/search-field";
import { PrivateContentAccessProvider, usePrivateContentAccess } from "@/ui/private-access";
import { confirmAction } from "@/ui/confirm";
import { readStashes, stashRequest, uncertainStashWrite, type GitStash, type StashMode, type StashOperation } from "./git-stash-model";
import { GitStashIdentity, GitStashReview, type StashReviewOperation } from "./git-stash-review";
import type { GitScope } from "./git-types";
import { FeatureUnavailable, RecordAccessUnavailable } from "./unavailable-state";

export function GitStashes({ scope, onClose, onBusyChange, registerExit }: {
  scope: GitScope; onClose: () => void; onBusyChange: (busy: boolean) => void;
  registerExit: (exit: (() => void) | null) => void;
}) {
  const { colors } = useMobileTheme(), copy = useCopy(), machine = useActiveMachine(), connection = useConnectionScope();
  const [opening] = useState(() => ({ machineId: machine?.id, machineName: machine?.name ?? "", scope: { ...scope }, connection }));
  const access = usePrivateContentAccess(), accessNow = useRef(access); accessNow.current = access;
  const mounted = useRef(false), occupied = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [creating, setCreating] = useState(false), [selected, setSelected] = useState<GitStash | null>(null), [details, setDetails] = useState(false);
  const [draft, setDraft] = useState<{ message: string; mode: StashMode }>({ message: "", mode: "untracked" });
  const draftNow = useRef(draft); draftNow.current = draft;
  const creatingNow = useRef(creating); creatingNow.current = creating;
  const selectedNow = useRef(selected); selectedNow.current = selected;
  const scopeCurrent = connection === opening.connection && opening.connection.isCurrent() && machine?.id === opening.machineId && useMachines.getState().activeId === opening.machineId;
  const supported = scopeCurrent && !!machine?.capabilities?.includes("workspace.run") && machine.capabilities.includes("git.actions");
  const inScope = supported && access.allowed && access.check();
  const query = useHostQuery<GitStash[]>(["git-stashes", opening.scope.projectId, opening.scope.root], "workspace.run", {}, {
    enabled: !!opening.scope.root && inScope,
    queryFn: async (client, signal) => readStashes(await client.request<unknown>("workspace.run", { command: "git_stash_list", args: { cwd: opening.scope.root } }, { signal })),
  });
  const mutation = useHostMutation("workspace.run", ["git", opening.scope.projectId]);
  const privateFailure = !!query.error && ["auth", "identity"].includes((query.error as { kind?: string }).kind ?? "");
  const readable = inScope && query.isEnabled !== false && query.fetchStatus !== "paused" && !privateFailure;
  const readLease = useMemo(() => ({ active: false }), [readable]);
  useLayoutEffect(() => { readLease.active = true; return () => { readLease.active = false; }; }, [readLease]);
  const createLease = useMemo(() => ({ active: false }), [creating, readable]);
  useLayoutEffect(() => { createLease.active = true; return () => { createLease.active = false; }; }, [createLease]);
  const current = () => mounted.current && readable && readLease.active && opening.connection.isCurrent() && accessNow.current.allowed && accessNow.current.check() && useMachines.getState().activeId === opening.machineId;
  const data = readable ? query.data : undefined, rows = data ?? [];
  const uncertain = uncertainStashWrite(mutation.error);
  const unavailable = !readable || !opening.scope.root || query.isError || !query.isSuccess || !data || uncertain || mutation.isPending;
  const canClear = !!machine?.capabilities?.includes("git.stash.clearSnapshot");
  const reviewLease = useMemo(() => ({ active: false }), [unavailable, data, selected, draft, canClear]);
  useLayoutEffect(() => { reviewLease.active = true; return () => { reviewLease.active = false; }; }, [reviewLease]);
  type Review = { operation: StashReviewOperation; request: ReturnType<typeof stashRequest>; lease: typeof reviewLease; title: string };
  const [review, setReview] = useState<Review | null>(null), reviewOwner = useRef<Review | null>(null);
  const cancelReview = () => { reviewOwner.current = null; setReview(null); };
  useLayoutEffect(() => { if (reviewOwner.current && reviewOwner.current.lease !== reviewLease) cancelReview(); }, [reviewLease]);
  useLayoutEffect(() => () => { reviewOwner.current = null; }, []);
  const latest = useRef({ unavailable, data, pending: mutation.isPending, enabled: query.isEnabled !== false, clear: canClear, refetch: query.refetch });
  latest.current = { unavailable, data, pending: mutation.isPending, enabled: query.isEnabled !== false, clear: canClear, refetch: query.refetch };
  const refresh = () => { if (mounted.current && inScope && latest.current.enabled && opening.connection.isCurrent() && accessNow.current.allowed && accessNow.current.check() && useMachines.getState().activeId === opening.machineId) return latest.current.refetch(); };
  const targetCurrent = (stash: GitStash) => latest.current.data?.some(item => item.index === stash.index && item.sha === stash.sha);
  const selectionAvailable = readable && selected && rows.some(item => item.index === selected.index && item.sha === selected.sha);
  const write = (operation: StashOperation, request: ReturnType<typeof stashRequest>, ownerDraft = draft) => {
    if (!current() || occupied.current || latest.current.unavailable) return;
    occupied.current = true; onBusyChange(true);
    void mutation.mutateAsync(request).then(() => {
      if (mounted.current) {
        setSelected(null);
        if (operation.kind === "create" && draftNow.current === ownerDraft) {
          const empty = { message: "", mode: "untracked" as const }; draftNow.current = empty; setDraft(empty); setCreating(false);
        }
      }
      void query.refetch();
    }).catch(() => { void query.refetch(); }).finally(() => { occupied.current = false; onBusyChange(false); });
  };
  const close = useCallback(() => {
    if (!mounted.current || occupied.current || draftNow.current !== draft) return;
    if (reviewOwner.current) { reviewOwner.current = null; setReview(null); return; }
    if (selectedNow.current) { const visible = current() && targetCurrent(selectedNow.current); setSelected(null); if (visible) return; }
    if (creatingNow.current) { setCreating(false); if (current()) return; }
    if (draft.message || draft.mode !== "untracked") {
      confirmAction(copy("Stash taslağını bırak?", "Leave stash draft?"), copy("Kaydedilmemiş stash açıklaması bırakılacak. Dosyalar değişmez.", "The unsaved stash description will be discarded. Files stay unchanged."),
        copy("Vazgeç", "Cancel"), () => { if (mounted.current && !occupied.current && draftNow.current === draft) onClose(); }, copy("Geri", "Back"));
    } else onClose();
  }, [draft, onClose, copy, readable, readLease]);
  useEffect(() => { registerExit(close); return () => registerExit(null); }, [close, registerExit]);
  const focused = useIsFocused();
  useBackHandler(focused, close);
  const openReview = (operation: StashReviewOperation) => {
    if (!current() || latest.current.unavailable || occupied.current || !reviewLease.active || reviewOwner.current) return;
    if (operation.kind === "clear" ? !latest.current.clear || operation.stashes !== latest.current.data : !targetCurrent(operation.stash) || selectedNow.current !== operation.stash) return;
    const captured = structuredClone(operation), request = stashRequest(opening.scope, captured);
    const title = captured.kind === "clear" ? copy("Tüm stash’leri sil", "Delete all stashes") : captured.kind === "drop" ? copy("Stash’i sil", "Delete stash")
      : captured.kind === "pop" ? copy("Uygula ve kaldır", "Apply and remove") : copy("Uygula", "Apply");
    const next = { operation: captured, request, lease: reviewLease, title }; reviewOwner.current = next; setReview(next);
  };
  const confirmReview = () => {
    if (!review || reviewOwner.current !== review || review.lease !== reviewLease || !reviewLease.active || !current() || latest.current.unavailable || occupied.current) return;
    if (review.operation.kind === "clear" ? !latest.current.clear : !targetCurrent(review.operation.stash)) return;
    reviewOwner.current = null; setReview(null); write(review.operation, review.request);
  };
  const updateDraft = (change: Partial<typeof draft>) => {
    if (!current() || !creatingNow.current || !createLease.active || occupied.current || latest.current.pending) return;
    // A native input can deliver multiple complete values before React commits.
    const next = { ...draftNow.current, ...change }; draftNow.current = next; setDraft(next);
  };
  const context = <><Body selectable>{opening.machineName}</Body><Body mono selectable>{opening.scope.root}</Body></>;
  return <>
    <ScreenList title={copy("Stash’ler", "Stashes")} subtitle={readable ? opening.machineName : undefined}
      context={readable ? <Body muted>{opening.scope.root?.split(/[\\/]/).filter(Boolean).at(-1)}</Body> : null}
      actions={<Row>
        <IconButton label={copy("Stash oluştur", "Create stash")} disabled={unavailable} onPress={() => { if (current() && !latest.current.unavailable && !occupied.current) setCreating(true); }}><Plus size={20} color={colors.accent} /></IconButton>
        <ActionMenu label={copy("Stash işlemleri", "Stash actions")} actions={[
          { key: "back", icon: <ArrowLeft size={18} color={colors.muted} />, label: copy("Geri", "Back"), disabled: mutation.isPending, onPress: close },
          { key: "refresh", icon: <RefreshCw size={18} color={colors.muted} />, label: copy("Yenile", "Refresh"), disabled: !inScope || query.isEnabled === false || query.isFetching, onPress: () => { void refresh(); } },
          readable && { key: "details", icon: <Info size={18} color={colors.muted} />, label: copy("Ayrıntılar", "Details"), onPress: () => { if (current()) setDetails(true); } },
          { key: "clear", icon: <Trash2 size={18} color={colors.danger} />, label: copy("Tüm stash’leri sil", "Delete all stashes"), destructive: true,
            disabled: unavailable || !rows.length || !latest.current.clear, onPress: () => { if (data) openReview({ kind: "clear", stashes: data }); } },
        ]} />
      </Row>}
      data={rows} keyExtractor={item => `${item.sha}:${item.index}`} query={{ ...query, data }} refresh={refresh}
      header={<>
        {!scopeCurrent ? <RecordAccessUnavailable />
          : !supported ? <FeatureUnavailable message={copy("Stash yönetimi için bilgisayardaki bycoda’yı güncelle.", "Update bycoda on this computer to manage stashes.")} />
          : !readable && !query.error ? <RecordAccessUnavailable />
          : <QueryState query={{ ...query, data }} empty={readable && query.isSuccess && data?.length === 0} emptyTitle={copy("Kaydedilmiş stash yok.", "No saved stashes.")} />}
        <MutationState mutation={mutation} />
        {uncertain ? <Notice tone="warning" message={copy("İşlem sonucu belirsiz. Yeniden denemeden önce bu bilgisayardaki değişiklikleri ve stash listesini incele.", "The result is uncertain. Review this computer’s changes and stash list before trying again.")} /> : null}
      </>}
      renderItem={({ item }) => <NavigationRow label={`stash@{${item.index}}`} detail={item.message} detailLines={2}
        metadata={`${new Date(item.timestamp * 1000).toLocaleDateString()} · ${item.sha}`} metadataLines={2}
        disabled={mutation.isPending} onPress={() => { if (current() && !occupied.current && targetCurrent(item)) setSelected(item); }} />} />
    <PrivateContentAccessProvider value={{ allowed: readable, check: current }}>
    <Sheet visible={!!selectionAvailable} size="form" title={copy("Stash işlemleri", "Stash actions")} dismissible={!mutation.isPending}
      onClose={() => { if (!occupied.current && selectedNow.current === selected) { cancelReview(); setSelected(null); } }}>
      {selectionAvailable && selected ? <>
        <CollectionToolbar field={<Body selectable>{opening.machineName}</Body>} actions={<ActionMenu label={copy("Diğer işlemler", "More actions")} actions={[
          { key: "pop", icon: <ArrowDownToLine size={18} color={colors.muted} />, label: copy("Uygula ve kaldır", "Apply and remove"), disabled: unavailable, onPress: () => openReview({ kind: "pop", stash: selected }) },
          { key: "drop", icon: <Trash2 size={18} color={colors.danger} />, label: copy("Stash’i sil", "Delete stash"), destructive: true, disabled: unavailable, onPress: () => openReview({ kind: "drop", stash: selected }) },
        ]} />} />
        <Body mono selectable>{opening.scope.root}</Body><GitStashIdentity stash={selected} />
        <FormActions submitLabel={copy("Uygula", "Apply")} disabled={unavailable} busy={mutation.isPending} onSubmit={() => openReview({ kind: "apply", stash: selected })}
          cancelLabel={copy("Geri", "Back")} onCancel={() => { if (!occupied.current && selectedNow.current === selected) setSelected(null); }} feedback={<MutationState mutation={mutation} />} />
      </> : null}
    </Sheet>
    <Sheet visible={creating && readable} size="form" title={copy("Stash oluştur", "Create stash")}
      dismissible={!mutation.isPending} dirty={draft.message !== "" || draft.mode !== "untracked"} onClose={() => { if (!occupied.current && draftNow.current === draft) setCreating(false); }}>
      {readable ? <>
      {context}
      <Field label={copy("Açıklama (isteğe bağlı)", "Description (optional)")} value={draft.message} maxLength={1000} multiline editable={!mutation.isPending} onChangeText={message => updateDraft({ message })} />
      <SelectField label={copy("Kapsam", "Scope")} value={draft.mode} disabled={mutation.isPending} onChange={mode => updateDraft({ mode: mode as StashMode })} options={[
        { value: "untracked", label: copy("İzlenmeyen dosyalar dahil", "Include untracked files") }, { value: "tracked", label: copy("Yalnız izlenen dosyalar", "Tracked files only") },
        { value: "staged", label: copy("Yalnız stage edilmiş değişiklikler", "Staged changes only") },
      ]} />
      <FormActions submitLabel={copy("Stash oluştur", "Create stash")} busy={mutation.isPending} disabled={unavailable}
        onSubmit={() => { if (current() && !latest.current.unavailable && !occupied.current && creatingNow.current && draftNow.current === draft) { const operation = { kind: "create" as const, ...draft }; write(operation, stashRequest(opening.scope, operation)); } }}
        cancelLabel={copy("Vazgeç", "Cancel")} cancelDisabled={mutation.isPending} onCancel={() => { if (!occupied.current && draftNow.current === draft) setCreating(false); }} feedback={<MutationState mutation={mutation} />} />
      </> : null}
    </Sheet>
    <Sheet visible={details && readable} size="compact" title={copy("Ayrıntılar", "Details")} onClose={() => setDetails(false)}>{readable ? context : null}</Sheet>
    {review && review.lease === reviewLease && !unavailable ? <GitStashReview title={review.title} machineName={opening.machineName} root={opening.scope.root ?? ""}
      operation={review.operation} onClose={() => { if (reviewOwner.current === review) cancelReview(); }} onConfirm={confirmReview} /> : null}
    </PrivateContentAccessProvider>
  </>;
}
