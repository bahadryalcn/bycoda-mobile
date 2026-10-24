import { useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from "expo-crypto";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostClient, useHostQuery } from "@/state/queries";
import { reviewedOperationStore, type ReviewedOperationAttempt } from "@/state/reviewed-operation-store";
import { reviewedMachine, isReviewedMachine } from "@/state/reviewed-machine";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { Body, Button, ErrorText, Notice, QueryState, SelectField, Sheet } from "@/ui/primitives";
import type { HostWorktrees } from "@/remote/types";
import type { SessionScope } from "./session-types";
import { readWorktreeRemoval, readWorktreeRemovalStatus, type WorktreeRemovalSnapshot, type WorktreeRemovalStatus } from "./worktree-removal-model";

/** Receipts survive closing/restarting; reopening reads status and never replays approval. */
export function WorktreeRemoval({ scope, projectId, onClose }: { scope: SessionScope; projectId: string; onClose: () => void }) {
  const copy = useCopy(), machine = useActiveMachine(), client = useHostClient();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [opening] = useState(() => ({ ...scope, projectId, environmentId: machine?.environmentId, machine: reviewedMachine(machine) }));
  const current = () => mounted.current && isReviewedMachine(opening.machine, useMachines.getState()) && scope.machineId === opening.machineId && scope.sessionId === opening.sessionId && projectId === opening.projectId;
  const supported = !!client && current() && !!opening.environmentId && machine?.capabilities?.includes("worktrees.removal.desktop.v1");
  const params = { projectId: opening.projectId, sessionId: opening.sessionId };
  const store = useMemo(() => reviewedOperationStore(AsyncStorage, `bycoda.worktree-removal.v1:${JSON.stringify([opening.machineId, opening.environmentId, opening.projectId, opening.sessionId])}`), [opening]);
  const [loading, setLoading] = useState(true), [attempt, setAttempt] = useState<ReviewedOperationAttempt | null>(null);
  const [receipt, setReceipt] = useState<WorktreeRemovalStatus>();
  const [path, setPath] = useState(""), [review, setReview] = useState<WorktreeRemovalSnapshot>();
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>();
  const occupied = useRef(false);
  useEffect(() => { let live = true; void store.load().then((value) => { if (live) setAttempt(value); }, (cause) => { if (live) setError(cause); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [store]);
  const trees = useHostQuery<HostWorktrees>(["worktrees", opening.projectId], "git.worktrees", { projectId: opening.projectId }, { enabled: !!supported && !attempt });
  const run = async (action: () => Promise<void>) => {
    if (occupied.current || !supported || !current()) return;
    occupied.current = true; setBusy(true); setError(undefined);
    try { await action(); } catch (cause) { setError(cause); } finally { occupied.current = false; setBusy(false); }
  };
  const disabled = busy || loading || !supported || !!error;
  return <Sheet visible title={copy("Çalışma klasörü kaldırma", "Worktree removal")} onClose={onClose} dismissible={!busy}>
    <Notice message={copy("Dal ve konuşmalar korunur. Kaldırma için bilgisayarda yeni onay gerekir. Ana çalışma kopyasındaki bir konuşmadan açın.", "The branch and conversations are retained. Removal requires fresh approval on the computer. Open this from a conversation in the base working copy.")} />
    {!supported ? <Notice message={copy("Bu bilgisayar güvenli çalışma klasörü kaldırmayı desteklemiyor.", "This computer does not support reviewed worktree removal.")} /> : null}
    <ErrorText error={error} />
    {attempt ? <>
      <Notice message={copy("Kaydedilmiş istek tekrar gönderilmez. Sonuç bilinmiyorsa bilgisayardaki çalışma klasörünü inceleyin.", "The saved request is never resent. If its result is unknown, inspect the worktree on the computer.")} />
      {receipt ? <Body>{receipt.state === "applied" ? copy("Tamamlandı", "Completed") : receipt.state === "failed" ? copy("Tamamlanmadı", "Not completed") : receipt.state === "pending" ? copy("Bilgisayarda onay bekleniyor", "Awaiting approval on the computer") : copy("Sonuç bilinmiyor", "Result unknown")}</Body> : null}{receipt?.path ? <Body mono>{receipt.path}</Body> : null}
      <Button label={copy("Sonucu oku", "Read result")} disabled={busy || !supported} onPress={() => { void run(async () => { const value = readWorktreeRemovalStatus(await client!.request("worktrees.removal.status", { ...params, requestId: attempt.operationId })); if (current()) setReceipt(value); }); }} />
      <Button tone="quiet" label={copy("Yerel takibi temizle", "Clear local tracking")} disabled={busy || !supported || !receipt || receipt.state === "pending"} onPress={() => confirmAction(copy("Yerel takibi temizle", "Clear local tracking"), copy("Bu işlem bilgisayardaki isteği iptal etmez. Bilinmeyen sonuç için önce bilgisayarı inceleyin. Yeni bir işlem yeni inceleme ve bilgisayar onayı gerektirir.", "This does not cancel the request on the computer. Inspect the computer first for an unknown result. A new operation requires a new review and computer approval."), copy("Yerel takibi temizle", "Clear local tracking"), () => { void run(async () => { await store.clear(attempt.operationId); setAttempt(null); setReceipt(undefined); setReview(undefined); await trees.refetch(); }); }, copy("Vazgeç", "Cancel"))} />
    </> : <>
      <QueryState query={trees} />
      <SelectField label={copy("Çalışma klasörü", "Working folder")} value={path} disabled={disabled} options={(trees.data?.worktrees ?? []).filter((tree) => !tree.isMain && !tree.missing).map((tree) => ({ value: tree.path, label: tree.branch || tree.path, detail: tree.path }))} onChange={(value) => { setPath(value); setReview(undefined); }} />
      <Button label={copy("Kaldırmayı incele", "Review removal")} disabled={disabled || !path || !trees.isSuccess} onPress={() => { void run(async () => { const value = readWorktreeRemoval(await client!.request("worktrees.removal.review", { ...params, path }), path); if (current()) setReview(value); }); }} />
      {review ? <><Body mono>{`${review.path}\n${review.branch}\n${review.head}`}</Body><Body>{`${copy("Bağlı konuşmalar", "Linked conversations")}: ${review.sessionIds.length}`}</Body>
        <Notice message={copy("Harici Git ve dosya sistemi değişiklikleri atomik olarak kilitlenemez. Bilgisayar işlemden önce yeniden denetler.", "External Git and filesystem changes cannot be locked atomically. The computer checks again before removal.")} />
        {review.reasons.map((reason) => <Notice key={reason} message={reason} />)}
        <Button tone="danger" label={copy("Bilgisayar onayı iste", "Request computer approval")} disabled={disabled || !review.canRemove || review.expiresAt <= Date.now()} onPress={() => { void run(async () => {
          if (!current() || review.expiresAt <= Date.now()) throw new Error("Removal review expired");
          const value = { operationId: randomUUID(), environmentId: opening.environmentId!, digest: await digestStringAsync(CryptoDigestAlgorithm.SHA256, review.reviewId) };
          const claimed = await store.claim(value); setAttempt(claimed.attempt);
          if (!claimed.claimed || !current()) return;
          const result = readWorktreeRemovalStatus(await client!.request("worktrees.removal.approve", { ...params, reviewId: review.reviewId, requestId: value.operationId }, { timeoutMs: 115000 }));
          if (current()) setReceipt(result);
        }); }} />
      </> : null}
    </>}
    {error ? <Button tone="quiet" label={copy("Hatayı temizle", "Clear error")} disabled={busy || !supported} onPress={() => setError(undefined)} /> : null}
  </Sheet>;
}
