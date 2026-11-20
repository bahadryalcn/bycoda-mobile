import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from "expo-crypto";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { useHostClient, useHostQuery } from "@/state/queries";
import { reviewedOperationStore } from "@/state/reviewed-operation-store";
import { useReviewedOperation } from "@/state/use-reviewed-operation";
import { reviewedMachine, isReviewedMachine } from "@/state/reviewed-machine";
import { useCopy } from "@/ui/copy";
import { RECORD_ACCESS_UNAVAILABLE } from "@/ui/record-access-copy";
import { ActionReviewSheet } from "@/ui/action-review-sheet";
import { ActionMenu, Body, Disclosure, ErrorText, FormActions, Notice, QueryState, SelectField, Sheet, Stack } from "@/ui/primitives";
import { CollectionToolbar } from "@/ui/search-field";
import { PrivateContentAccessProvider, usePrivateContentAccess } from "@/ui/private-access";
import type { HostWorktrees } from "@/remote/types";
import type { SessionScope } from "./session-types";
import { WorktreeRemovalReview } from "./worktree-removal-review";
import { readWorktreeRemoval, readWorktreeRemovalStatus, type WorktreeRemovalSnapshot, type WorktreeRemovalStatus } from "./worktree-removal-model";
import { FeatureUnavailable } from "./unavailable-state";

/** Durable receipt identity stays independent from draft and presentation authority. */
export function WorktreeRemoval({ scope, projectId, onClose }: { scope: SessionScope; projectId: string; onClose: () => void }) {
  const copy = useCopy(), machine = useActiveMachine(), client = useHostClient(), connection = useConnectionScope(), access = usePrivateContentAccess();
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [opening] = useState(() => ({ ...scope, projectId, environmentId: machine?.environmentId, machine: reviewedMachine(machine), machineName: machine?.name ?? machine?.id ?? "", connection }));
  const scopeCurrent = connection === opening.connection && opening.connection.isCurrent() && isReviewedMachine(opening.machine, useMachines.getState()) && scope.machineId === opening.machineId && scope.sessionId === opening.sessionId && projectId === opening.projectId;
  const supported = !!client && scopeCurrent && !!opening.environmentId && !!machine?.capabilities?.includes("worktrees.removal.desktop.v1");
  const available = supported && access.allowed && access.check();
  const params = { projectId: opening.projectId, sessionId: opening.sessionId };
  const store = useMemo(() => reviewedOperationStore(AsyncStorage, `bycoda.worktree-removal.v1:${JSON.stringify([opening.machineId, opening.environmentId, opening.projectId, opening.sessionId])}`), [opening]);
  const [statusAccessFailure, setStatusAccessFailure] = useState<unknown>();
  const { loading, ready, loaded: attempt, setLoaded: setAttempt, error, setError, busy, pendingAction, occupied, run } = useReviewedOperation({ source: store, load: () => store.load(), canRun: (): boolean => ready && originCurrent() && sameEnvironment,
    onFailure: cause => { if (mounted.current && live.current.attempt && ["auth", "identity"].includes((cause as {kind?:string})?.kind ?? "")) setStatusAccessFailure(cause); } });
  const [receipt, setReceipt] = useState<WorktreeRemovalStatus>();
  const [path, setPath] = useState("");
  const trees = useHostQuery<HostWorktrees>(["worktrees", opening.projectId], "git.worktrees", { projectId: opening.projectId }, { enabled: available && !attempt });
  const sameEnvironment = !attempt || attempt.environmentId === opening.environmentId;
  const privateError = [statusAccessFailure, error, ...(!attempt ? [trees.error] : [])].find(cause => cause && ["auth", "identity"].includes((cause as {kind?:string}).kind ?? ""));
  // Once a receipt exists, the intentionally disabled folder query cannot block status reads.
  const readable = available && sameEnvironment && !privateError && (!!attempt || trees.isEnabled !== false && trees.fetchStatus !== "paused");
  const readLease = useMemo(() => ({ active: false }), [readable]);
  useLayoutEffect(() => { readLease.active = true; return () => { readLease.active = false; }; }, [readLease]);
  const live = useRef({ available, access, attempt, receipt }); live.current = { available, access, attempt, receipt };
  const originCurrent = () => mounted.current && live.current.available && opening.connection.isCurrent() && isReviewedMachine(opening.machine, useMachines.getState()) && live.current.access.allowed && live.current.access.check();
  const statusLease = useMemo(() => ({ active: false }), [available, sameEnvironment]);
  useLayoutEffect(() => { statusLease.active = true; return () => { statusLease.active = false; }; }, [statusLease]);
  const canRead = () => readable && readLease.active && originCurrent();
  const lease = useMemo(() => ({ active: false }), [readable, path, trees.data]);
  useLayoutEffect(() => { lease.active = true; return () => { lease.active = false; }; }, [lease]);
  type Review = { value: WorktreeRemovalSnapshot; lease: typeof lease };
  const [review, setReview] = useState<Review>();
  const reviewIssued = useRef<Review | undefined>(undefined);
  useLayoutEffect(() => { if (review && review.lease !== lease) { reviewIssued.current = undefined; setReview(undefined); } }, [review, lease]);
  useLayoutEffect(() => () => { reviewIssued.current = undefined; }, []);
  const [clock, setClock] = useState(0);
  useEffect(() => { if (!review || review.value.expiresAt <= Date.now()) return; const timer = setTimeout(() => setClock(Date.now()), Math.min(2_147_483_647, review.value.expiresAt - Date.now() + 1)); return () => clearTimeout(timer); }, [review, clock]);
  const expired = !!review && review.value.expiresAt <= Date.now();
  const disabled = busy || loading || !ready || !readable || !!error;
  const eligible = trees.data?.worktrees.some(tree => tree.path === path && !tree.isMain && !tree.missing);
  const close = () => { if (mounted.current && readLease.active && !occupied.current) onClose(); };
  const clearError = () => { if (originCurrent() && !occupied.current) setError(undefined); };
  const refresh = () => { if (originCurrent() && !occupied.current && !live.current.attempt && trees.isEnabled !== false) void trees.refetch(); };
  const choose = (value: string) => {
    if (!canRead() || !lease.active || occupied.current || disabled || live.current.attempt || !trees.data?.worktrees.some(tree => tree.path === value && !tree.isMain && !tree.missing)) return;
    setPath(value); setReview(undefined);
  };
  const inspect = () => {
    if (!canRead() || !lease.active || disabled || live.current.attempt || !eligible || !trees.isSuccess || trees.isError) return;
    void run(async () => { const value = readWorktreeRemoval(await client!.request("worktrees.removal.review", { ...params, path }), path); if (canRead() && lease.active && !live.current.attempt) { const next = { value, lease }; reviewIssued.current = next; setReview(next); } }, "secondary-3");
  };
  const cancelReview = () => { if (mounted.current && lease.active && !occupied.current && review?.lease === lease && reviewIssued.current === review) { reviewIssued.current = undefined; setReview(undefined); } else if (mounted.current && lease.active && !occupied.current && review && !reviewIssued.current) setReview(undefined); };
  const approve = () => {
    if (!review || reviewIssued.current !== review || review.lease !== lease || !lease.active || !canRead() || disabled || !eligible || live.current.attempt || !review.value.canRemove || review.value.expiresAt <= Date.now()) return;
    const snapshot = review.value;
    reviewIssued.current = undefined;
    void run(async () => {
      const currentReview = () => canRead() && lease.active && snapshot.expiresAt > Date.now();
      if (!currentReview()) throw new Error("Removal review expired");
      const value = { operationId: randomUUID(), environmentId: opening.environmentId!, digest: await digestStringAsync(CryptoDigestAlgorithm.SHA256, snapshot.reviewId) };
      if (!currentReview()) return;
      const claimed = await store.claim(value);
      if (mounted.current) setAttempt(claimed.attempt);
      if (!claimed.claimed) return;
      if (!currentReview()) { await store.clear(value.operationId); if (mounted.current) { setAttempt(null); setReview(undefined); } return; }
      const result = readWorktreeRemovalStatus(await client!.request("worktrees.removal.approve", { ...params, reviewId: snapshot.reviewId, requestId: value.operationId }, { timeoutMs: 115000 }));
      if (mounted.current) { setReceipt(result); setReview(undefined); }
    }, "secondary-4");
  };
  const readStatus = () => {
    const repair = () => !!statusAccessFailure && statusLease.active && originCurrent() && sameEnvironment;
    const allowed = () => canRead() || repair();
    if (!attempt || live.current.attempt !== attempt || !allowed() || occupied.current || !ready || !sameEnvironment) return;
    void run(async () => { const result = readWorktreeRemovalStatus(await client!.request("worktrees.removal.status", { ...params, requestId: attempt.operationId })); if (allowed() && live.current.attempt === attempt) { setReceipt(result); setStatusAccessFailure(undefined); } }, "secondary-1");
  };
  type ClearReview = { attempt: NonNullable<typeof attempt>; receipt: WorktreeRemovalStatus; lease: typeof readLease };
  const [clearReview, setClearReview] = useState<ClearReview>();
  const clearIssued = useRef<ClearReview | undefined>(undefined);
  useLayoutEffect(() => { if (clearIssued.current && (clearIssued.current.lease !== readLease || clearIssued.current.attempt !== attempt || clearIssued.current.receipt !== receipt)) { clearIssued.current = undefined; setClearReview(undefined); } }, [readLease, attempt, receipt]);
  useLayoutEffect(() => () => { clearIssued.current = undefined; }, []);
  const openClear = () => {
    if (!attempt || !receipt || live.current.attempt !== attempt || live.current.receipt !== receipt || receipt.state === "pending" || !canRead() || occupied.current || !ready || clearIssued.current) return;
    const value = { attempt, receipt, lease: readLease }; clearIssued.current = value; setClearReview(value);
  };
  const cancelClear = () => { if (clearReview && clearIssued.current === clearReview && !occupied.current) { clearIssued.current = undefined; setClearReview(undefined); } };
  const clear = () => {
    if (!clearReview || clearIssued.current !== clearReview || !clearReview.lease.active || !canRead() || occupied.current || live.current.attempt !== clearReview.attempt || live.current.receipt !== clearReview.receipt || clearReview.receipt.state === "pending") return;
    clearIssued.current = undefined; setClearReview(undefined);
    void run(async () => { await store.clear(clearReview.attempt.operationId); if (mounted.current) { setAttempt(null); setReceipt(undefined); setReview(undefined); } if (canRead()) await trees.refetch(); }, "secondary-2");
  };
  const unavailableMessage = !client || !machine ? copy("Bilgisayar bağlantısını yeniden kurun ve bu oturumu tekrar açın.", "Reconnect the computer and reopen this session.")
    : !scopeCurrent ? copy("Bu işlemin bilgisayarını ve kaynak oturumunu yeniden açın. Mevcut seçim korunur.", "Reopen this operation's computer and source session. The current selection is retained.")
      : !supported ? copy("Bu bilgisayar güvenli çalışma ağacı kaldırmayı desteklemiyor. Bilgisayardaki bycoda uygulamasını güncelleyin.", "This computer does not support reviewed worktree removal. Update bycoda on the computer.")
        : copy(...RECORD_ACCESS_UNAVAILABLE);
  const feedback = <ErrorText error={error} />;
  return <><Sheet visible title={copy("Çalışma ağacı kaldırma", "Worktree removal")} size="form" onClose={close} dismissible={!busy}>
    {readable ? <>
      <CollectionToolbar field={<Body selectable>{opening.machineName}</Body>} actions={<ActionMenu label={copy("Diğer işlemler", "More actions")} actions={[
        !attempt && {key:"refresh",label:copy("Yenile", "Refresh"),disabled:busy || trees.isEnabled===false,onPress:refresh},
        !!attempt && {key:"clear",label:copy("Yerel takibi temizle", "Clear local tracking"),disabled:busy || !receipt || receipt.state==="pending",onPress:openClear},
        !!error && {key:"error",label:copy("Hatayı temizle", "Clear error"),disabled:busy,onPress:clearError},
      ]} />} />
      {attempt ? <Stack>
        <Notice message={copy("Kaydedilmiş istek tekrar gönderilmez. Sonuç bilinmiyorsa bilgisayardaki çalışma ağacını inceleyin.", "The saved request is never resent. If its result is unknown, inspect the worktree on the computer.")} />
        <Body>{receipt?.state === "applied" ? copy("Tamamlandı", "Completed") : receipt?.state === "failed" ? copy("Tamamlanmadı", "Not completed") : receipt?.state === "pending" ? copy("Bilgisayarda onay bekleniyor", "Awaiting approval on the computer") : copy("Sonuç bilinmiyor", "Result unknown")}</Body>
        {receipt?.path ? <Body mono selectable>{receipt.path}</Body> : null}{receipt?.message ? <Body selectable>{receipt.message}</Body> : null}
        <Disclosure label={copy("Ayrıntılar", "Details")}><Body mono selectable>{attempt.operationId}</Body></Disclosure>
        <FormActions submitLabel={copy("Sonucu oku", "Read result")} disabled={busy || !ready} busy={busy && pendingAction==="secondary-1"} onSubmit={readStatus} onCancel={close} cancelLabel={copy("Kapat", "Close")} feedback={feedback} />
      </Stack> : <>
        <QueryState query={{...trees,refetch:refresh}} />
        <SelectField label={copy("Çalışma klasörü", "Working folder")} value={path} searchable disabled={disabled || !!review}
          options={(trees.data?.worktrees ?? []).filter(tree=>!tree.isMain&&!tree.missing).map(tree=>({value:tree.path,label:tree.branch||tree.path,detail:tree.path}))} onChange={choose} />
        <Notice message={copy("Dal ve konuşmalar korunur. Kaldırma için bilgisayarda yeni onay gerekir. Ana çalışma kopyasındaki bir konuşmadan açın.", "The branch and conversations are retained. Removal requires fresh approval on the computer. Open this from a conversation in the base working copy.")} />
        <FormActions submitLabel={copy("Kaldırmayı incele", "Review removal")} disabled={disabled || !eligible || !trees.isSuccess || !!trees.isError || !!review} busy={busy && pendingAction==="secondary-3"} onSubmit={inspect} feedback={feedback} onCancel={close} cancelLabel={copy("Kapat", "Close")} />
      </>}
    </> : <>
      {privateError ? <ErrorText error={privateError} /> : <FeatureUnavailable message={unavailableMessage} />}
      <FormActions submitLabel={attempt && statusAccessFailure ? copy("Sonucu oku", "Read result") : error ? copy("Hatayı temizle", "Clear error") : copy("Yenile", "Refresh")} disabled={!available || !sameEnvironment || busy || (!error && !statusAccessFailure && (!!attempt || trees.isEnabled===false))} busy={busy} onSubmit={attempt && statusAccessFailure ? readStatus : error ? clearError : refresh} onCancel={close} cancelLabel={copy("Kapat", "Close")} />
    </>}
  </Sheet><PrivateContentAccessProvider value={{allowed:readable,check:canRead}}>
    {review && review.lease===lease && readable && !attempt ? <WorktreeRemovalReview value={review.value} machineName={opening.machineName} disabled={disabled || !review.value.canRemove || expired || !eligible} busy={busy} feedback={<>{feedback}{expired ? <Notice tone="warning" message={copy("İncelemenin süresi doldu. Devam etmeden önce yeniden inceleyin.", "This review expired. Review it again before continuing.")} /> : null}</>} onClose={cancelReview} onConfirm={approve} /> : null}
    {clearReview && clearIssued.current===clearReview && clearReview.lease===readLease && readable ? <ActionReviewSheet title={copy("Yerel takibi temizle", "Clear local tracking")} submitLabel={copy("Yerel takibi temizle", "Clear local tracking")} onClose={cancelClear} onConfirm={clear}>
      <Stack><Body selectable>{opening.machineName}</Body>{clearReview.receipt.path ? <Body mono selectable>{clearReview.receipt.path}</Body> : null}<Body mono selectable>{clearReview.attempt.operationId}</Body>
        <Notice message={copy("Bu işlem bilgisayardaki isteği iptal etmez. Bilinmeyen sonuç için önce bilgisayarı inceleyin. Yeni bir işlem yeni inceleme ve bilgisayar onayı gerektirir.", "This does not cancel the request on the computer. Inspect the computer first for an unknown result. A new operation requires a new review and computer approval.")} /></Stack>
    </ActionReviewSheet> : null}
  </PrivateContentAccessProvider></>;
}
