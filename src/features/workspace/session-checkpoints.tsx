import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { ActionMenu, Body, Disclosure, ErrorText, FormActions, NavigationRow, Notice, QueryState, ScreenList, Sheet, Stack } from "@/ui/primitives";
import { CollectionToolbar } from "@/ui/search-field";
import { PrivateContentAccessProvider, usePrivateContentAccess } from "@/ui/private-access";
import { RemoteHostError } from "@/remote/transport";
import { UncertainCommand } from "./commands";
import { GitDiffViewer } from "./git-diff-viewer";
import { gitChangeLabel, gitFilePresentation } from "./git-file-presentation";
import { useDiffPreview } from "./use-diff-preview";
import { SessionCheckpointReview, type CheckpointReview } from "./session-checkpoint-review";
import type { HostSession } from "./wire";
import type { SessionCommand, SessionScope } from "./session-types";
import { checkpointChange, checkpointRead, checkpointReviewMatches, reviewRewind, rewindCommand, validateCheckpointDiff, validateCheckpointStatus, type ReviewedCheckpoint, type ReviewedCheckpointDiff } from "./session-checkpoint-model";
import { FeatureUnavailable, RecordAccessUnavailable } from "./unavailable-state";

/** Captured checkpoint content and session authority survive presentation changes. */
export function SessionCheckpoints({ scope, session, blocked, onCommand, onRefresh, onClose }: {
  scope: SessionScope; session: HostSession; blocked: boolean; onCommand: SessionCommand; onRefresh: () => void; onClose: () => void;
}) {
  const copy = useCopy(), machine = useActiveMachine(), connection = useConnectionScope(), access = usePrivateContentAccess();
  const numbers = new Intl.NumberFormat(useLocale());
  const cwd = session.session.worktreeCwd || session.session.cwd || "";
  const [opening] = useState(() => ({ target: { ...scope, cwd }, connection, machineName: machine?.name ?? machine?.id ?? "" }));
  const target = opening.target;
  const mounted = useRef(false), occupied = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const scopeCurrent = connection === opening.connection && opening.connection.isCurrent() && machine?.id === target.machineId &&
    useMachines.getState().activeId === target.machineId && scope.machineId === target.machineId && scope.sessionId === target.sessionId && session.session.id === target.sessionId && cwd === target.cwd;
  const supported = scopeCurrent && !!machine?.capabilities?.includes("workspace.run");
  const guarded = supported && !!machine?.capabilities?.includes("sessions.checkpoint-review");
  const rewindSupported = scopeCurrent && !!machine?.capabilities?.includes("sessions.rewind");
  const available = scopeCurrent && access.allowed && access.check();
  const [selected, setSelected] = useState<{ status: ReviewedCheckpoint; diff: ReviewedCheckpointDiff } | null>(null);
  const [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const query = useHostQuery<ReviewedCheckpoint>(["session-checkpoint", target.sessionId, target.cwd], "workspace.run", {command:"session_checkpoint_status",args:{sessionId:target.sessionId,cwd:target.cwd}}, {
    enabled: available && supported && !!target.cwd,
    queryFn: async (client, signal) => validateCheckpointStatus(await client.request("workspace.run", checkpointRead(target), { signal })),
  });
  const mutation = useHostMutation("workspace.run", ["session-checkpoint", target.sessionId]);
  const kind = (query.error as {kind?:string}|null)?.kind;
  const readable = available && query.isEnabled !== false && query.fetchStatus !== "paused" && kind !== "auth" && kind !== "identity";
  const readLease = useMemo(() => ({ active: false }), [readable, query.data, blocked]);
  useLayoutEffect(() => { readLease.active = true; return () => { readLease.active = false; }; }, [readLease]);
  const live = useRef({ available, access, blocked, uncertain, selected, session, guarded, rewindSupported });
  live.current = { available, access, blocked, uncertain, selected, session, guarded, rewindSupported };
  const originCurrent = () => mounted.current && live.current.available && opening.connection.isCurrent() && live.current.access.allowed && live.current.access.check() && useMachines.getState().activeId === target.machineId;
  const current = () => readable && readLease.active && originCurrent();
  const disabled = !readable || busy || blocked || uncertain;
  const run = async (action: () => Promise<unknown>, write = false) => {
    if (!current() || occupied.current || live.current.blocked || write && live.current.uncertain) return;
    occupied.current = true; setBusy(true); setError(null);
    try { await action(); }
    catch (cause) { if (mounted.current) { setError(cause); if (write && (cause instanceof UncertainCommand || cause instanceof RemoteHostError && cause.uncertain)) setUncertain(true); } }
    finally { occupied.current = false; if (mounted.current) setBusy(false); }
  };
  const refresh = () => { if (originCurrent() && query.isEnabled !== false && !occupied.current) void query.refetch(); };
  const close = () => { if (mounted.current && readLease.active && !occupied.current) onClose(); };
  const selectedCurrent = !!selected && checkpointReviewMatches(selected.status, selected.diff) &&
    selected.status.expectedCheckpoint === query.data?.expectedCheckpoint && !!query.data?.files.some(file => file.relative === selected.diff.relative);
  const lease = useMemo(() => ({ active: false }), [selected, query.data, session, disabled, guarded, rewindSupported]);
  useLayoutEffect(() => { lease.active = true; return () => { lease.active = false; }; }, [lease]);
  type Pending = { value: CheckpointReview; lease: typeof lease };
  const [pending, setPending] = useState<Pending | null>(null), issued = useRef<Pending | null>(null);
  useLayoutEffect(() => { if (issued.current && issued.current.lease !== lease) { issued.current = null; setPending(null); } }, [lease]);
  useLayoutEffect(() => () => { issued.current = null; }, []);
  const open = (value: CheckpointReview) => {
    if (!current() || !lease.active || disabled || occupied.current || issued.current) return;
    const next = {value,lease}; issued.current = next; setPending(next);
  };
  const cancelReview = () => { if (pending && issued.current === pending && !occupied.current) { issued.current = null; setPending(null); } };
  const change = (undo: boolean) => {
    if (!selected || live.current.selected !== selected || !guarded || !selectedCurrent || disabled) return;
    try { checkpointChange(target, selected.status, selected.diff.relative, undo); open({kind:"file",diff:selected.diff,undo,checkpoint:selected.status.expectedCheckpoint!}); }
    catch(cause) { setError(cause); }
  };
  const confirm = () => {
    if (!pending || issued.current !== pending || pending.lease !== lease || !lease.active || !current() || disabled || occupied.current) return;
    const value = pending.value;
    if (value.kind === "file" && (!guarded || !selectedCurrent || selected?.diff !== value.diff) || value.kind === "rewind" && !rewindSupported) return;
    issued.current = null; setPending(null);
    void run(async () => {
      if (value.kind === "file") {
        await mutation.mutateAsync(checkpointChange(target, selected!.status, value.diff.relative, value.undo));
        if (mounted.current) setSelected(null);
      } else await onCommand(rewindCommand(live.current.session, value.review));
      if (current()) { await query.refetch(); if (current()) onRefresh(); }
    }, true);
  };
  const preview = useDiffPreview(readable && selected && !selected.diff.binary && !selected.diff.tooLarge ? selected.diff.original : undefined, readable && selected && !selected.diff.binary && !selected.diff.tooLarge ? selected.diff.current : undefined);
  const feedback = <>{uncertain ? <Notice tone="warning" message={copy("İşlem sonucu belirsiz. Yeniden göndermeden önce oturumu ve dosyaları bilgisayarda kontrol et.", "The result is uncertain. Check the session and files on the computer before sending again.")} /> : <ErrorText error={error} />}</>;
  const userMessages = session.session.blocks.filter(block => block.role === "user" && !block.draft && !block.internal);
  type ReviewRow = {kind:"file";file:ReviewedCheckpoint["files"][number]} | {kind:"heading"} | {kind:"message";block:typeof userMessages[number]};
  const rows:ReviewRow[] = !readable || selected ? [] : [...(query.data?.files ?? []).map((file):ReviewRow=>({kind:"file",file})),{kind:"heading"},...userMessages.map((block):ReviewRow=>({kind:"message",block}))];
  return <><Sheet visible title={copy("Oturum incelemesi", "Session review")} size="full" scroll={false} dismissible={!busy} onClose={close}>
    <ScreenList data={rows} keyExtractor={row=>row.kind==="file"?`file:${row.file.relative}`:row.kind==="message"?`message:${row.block.id}`:"heading"} header={<Stack>
      {readable ? <>
        <CollectionToolbar field={<Body selectable>{opening.machineName}</Body>} actions={<ActionMenu label={copy("Diğer işlemler", "More actions")} actions={[
          {key:"refresh",label:copy("Yenile", "Refresh"),disabled:busy || !supported,onPress:refresh},
          !!selected && {key:"back",label:copy("Dosyalara dön", "Back to files"),disabled:busy,onPress:()=>{if(current() && lease.active && !occupied.current && live.current.selected === selected)setSelected(null);}},
          !!selected && {key:"undo",label:copy("Dosya değişikliklerini geri al", "Undo file changes"),destructive:true,disabled:disabled || !guarded || !selectedCurrent || !selected.status.files.find(file=>file.relative===selected.diff.relative)?.undoable,onPress:()=>change(true)},
        ]} />} />
        <Body mono selectable>{target.cwd}</Body>
        {!guarded ? <FeatureUnavailable message={copy("Güvenli checkpoint işlemleri için bilgisayardaki bycoda’yı güncelle. Checkpoint incelemesi salt okunurdur.", "Update bycoda on this computer for guarded checkpoint actions. Checkpoint review is read-only.")} /> : null}
        {selected ? <>
          <Body mono selectable>{selected.diff.relative}</Body>
          {selected.diff.binary || selected.diff.tooLarge || preview?.tooLarge ? <Notice message={copy("Bu dosya için satır farkı gösterilemiyor.", "Line diff is unavailable for this file.")} /> : preview ? <GitDiffViewer lines={preview.lines} /> : <Body muted>{copy("Diff hesaplanıyor…", "Computing diff…")}</Body>}
          {preview?.truncated ? <Notice message={copy("Fark önizlemesi kısaltıldı. Dosyanın tamamını bilgisayarda incele.", "The diff preview is truncated. Review the complete file on the computer.")} /> : null}
          {!selectedCurrent ? <Notice tone="warning" message={copy("Checkpoint değişti. Dosyaları yenileyip tekrar incele.", "The checkpoint changed. Refresh and review the files again.")} /> : null}
          <FormActions submitLabel={copy("Değişiklikleri koru", "Keep changes")} disabled={disabled || !guarded || !selectedCurrent || !!pending} busy={busy} onSubmit={()=>change(false)} feedback={feedback} />
        </> : <>{feedback}<QueryState query={query} empty={query.isSuccess && !query.data?.files.length} emptyTitle={copy("İncelenecek oturum değişikliği yok.", "No session changes to review.")} /></>}
        {uncertain ? <Disclosure label={copy("Ayrıntılar", "Details")}><ErrorText error={error} /></Disclosure> : null}
      </> : <>
        {kind === "auth" || kind === "identity" ? <QueryState query={{...query,data:undefined,refetch:refresh}} /> : <RecordAccessUnavailable />}
        <FormActions submitLabel={copy("Yenile", "Refresh")} disabled={!available || query.isEnabled===false || busy} onSubmit={refresh} onCancel={close} cancelLabel={copy("Kapat", "Close")} />
      </>}
    </Stack>} renderItem={({item})=>item.kind==="file" ? <NavigationRow label={item.file.relative}
      detail={[
        gitChangeLabel(gitFilePresentation(item.file.status).kind, copy),
        `+${numbers.format(item.file.additions)} −${numbers.format(item.file.deletions)}`,
        !item.file.exact && copy("Tam olarak incelenemiyor", "Cannot be reviewed exactly"),
      ].filter(Boolean).join(" · ")}
      detailLines={2} disabled={busy || blocked || !supported || !item.file.exact}
      onPress={()=>{const status=query.data;if(!status || !supported || !item.file.exact || busy || blocked || !current() || !lease.active || !status.files.includes(item.file))return;void run(async()=>{const result=await mutation.mutateAsync(checkpointRead(target,item.file.relative));if(current() && !live.current.blocked)setSelected({status,diff:validateCheckpointDiff(result,item.file.relative)});});}} /> : item.kind==="heading" ? <Stack>
        <Body>{copy("Konuşmayı geri sar", "Rewind conversation")}</Body><Body muted>{copy("Seçilen mesaj ve sonrasını konuşmadan kaldırır; dosyaları değiştirmez. Mesaj taslağa geri döner.", "Removes the selected message and later messages from the conversation; files stay unchanged. The prompt returns to the draft.")}</Body>
      </Stack> : <NavigationRow label={item.block.text || copy("Ekli mesaj", "Message with attachments")} disabled={disabled || !rewindSupported} onPress={()=>{if(!current() || !lease.active || disabled || !rewindSupported)return;try{const review=reviewRewind(session,item.block.id);const ids=new Set(review.affectedIds);open({kind:"rewind",review,blocks:session.session.blocks.filter(block=>ids.has(block.id))});}catch(cause){setError(cause);}}} />} />
  </Sheet><PrivateContentAccessProvider value={{allowed:readable,check:current}}>
    {pending && pending.lease===lease && !disabled ? <SessionCheckpointReview value={pending.value} machineName={opening.machineName} cwd={target.cwd} onClose={cancelReview} onConfirm={confirm} /> : null}
  </PrivateContentAccessProvider></>;
}
