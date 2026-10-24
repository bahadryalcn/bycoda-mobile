import { useRef, useState } from "react";
import { View } from "react-native";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { Body, Button, ErrorText, FormActions, MutationState, NavigationRow, Notice, QueryState, ScreenList, Sheet } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import { confirmAction } from "@/ui/confirm";
import { RemoteHostError } from "@/remote/transport";
import { UncertainCommand } from "./commands";
import { GitDiffViewer } from "./git-diff-viewer";
import { useDiffPreview } from "./use-diff-preview";
import type { HostSession } from "./wire";
import type { SessionCommand, SessionScope } from "./session-types";
import { checkpointChange, checkpointRead, checkpointReviewMatches, reviewRewind, rewindCommand, validateCheckpointDiff, validateCheckpointStatus, type ReviewedCheckpoint, type ReviewedCheckpointDiff, type RewindReview } from "./session-checkpoint-model";

/** Read-only review first; writes retain the exact host checkpoint token that was opened. */
export function SessionCheckpoints({ scope, session, blocked, onCommand, onRefresh, onClose }: {
  scope: SessionScope; session: HostSession; blocked: boolean; onCommand: SessionCommand; onRefresh: () => void; onClose: () => void;
}) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const target = { ...scope, cwd: session.session.worktreeCwd || session.session.cwd || "" };
  const supported = machine?.id === scope.machineId && machine.capabilities?.includes("workspace.run");
  const guarded = supported && machine.capabilities?.includes("sessions.checkpoint-review");
  const rewindSupported = machine?.id === scope.machineId && machine.capabilities?.includes("sessions.rewind");
  const [selected, setSelected] = useState<{ status: ReviewedCheckpoint; diff: ReviewedCheckpointDiff } | null>(null);
  const [rewind, setRewind] = useState<RewindReview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const occupied = useRef(false);
  const query = useHostQuery<ReviewedCheckpoint>(["session-checkpoint", scope.sessionId, target.cwd], "workspace.run", { command: "session_checkpoint_status", args: { sessionId: scope.sessionId, cwd: target.cwd } }, {
    enabled: !!supported && !!target.cwd,
    queryFn: async (client, signal) => validateCheckpointStatus(await client.request("workspace.run", checkpointRead(target), { signal })),
  });
  const mutation = useHostMutation("workspace.run", ["session-checkpoint", scope.sessionId]);
  const run = async (action: () => Promise<unknown>, write = false) => {
    if (occupied.current || blocked || uncertain || useMachines.getState().activeId !== scope.machineId) return;
    occupied.current = true; setBusy(true); setError(null);
    try { await action(); }
    catch (cause) { setError(cause); if (write && (cause instanceof UncertainCommand || cause instanceof RemoteHostError && cause.uncertain)) setUncertain(true); }
    finally { occupied.current = false; setBusy(false); }
  };
  const disabled = busy || blocked || uncertain || machine?.id !== scope.machineId;
  const preview = useDiffPreview(selected && !selected.diff.binary && !selected.diff.tooLarge ? selected.diff.original : undefined, selected && !selected.diff.binary && !selected.diff.tooLarge ? selected.diff.current : undefined);
  const change = (undo: boolean) => {
    if (!selected || !guarded || disabled || !checkpointReviewMatches(selected.status, selected.diff)) return;
    const review = selected;
    confirmAction(undo ? copy("Dosya değişikliklerini geri al", "Undo file changes") : copy("Değişiklikleri koru", "Keep changes"),
      `${target.cwd}\n\n${review.diff.relative}\n\n${undo ? copy("Yalnız bu oturumun incelenen değişiklikleri geri alınacak.", "Only this session’s reviewed changes will be undone.") : copy("Dosya korunacak ve oturum inceleme listesinden çıkarılacak.", "The file will stay and leave this session’s review list.")}`,
      undo ? copy("Geri al", "Undo") : copy("Koru", "Keep"), () => { void run(async () => {
        await mutation.mutateAsync(checkpointChange(target, review.status, review.diff.relative, undo));
        setSelected(null); await query.refetch(); onRefresh();
      }, true); }, copy("Vazgeç", "Cancel"));
  };
  const userMessages = session.session.blocks.filter((block) => block.role === "user" && !block.draft && !block.internal);
  type ReviewRow = { kind: "file"; file: ReviewedCheckpoint["files"][number] } | { kind: "heading" } | { kind: "message"; block: typeof userMessages[number] };
  const rows: ReviewRow[] = selected ? [] : [...(query.data?.files ?? []).map((file): ReviewRow => ({ kind: "file", file })), { kind: "heading" }, ...userMessages.map((block): ReviewRow => ({ kind: "message", block }))];
  return <Sheet visible title={copy("Oturum incelemesi", "Session review")} size="full" scroll={false} dismissible={!busy} onClose={onClose}>
    <ScreenList data={rows} keyExtractor={(row) => row.kind === "file" ? `file:${row.file.relative}` : row.kind === "message" ? `message:${row.block.id}` : "heading"} header={<View style={{ gap: space.sm }}>
    <Body mono>{target.cwd}</Body>
    {!guarded ? <Notice message={copy("Güvenli checkpoint işlemleri için bilgisayardaki bycoda’yı güncelle. Checkpoint incelemesi salt okunurdur.", "Update bycoda on this computer for guarded checkpoint actions. Checkpoint review is read-only.")} /> : null}
    <ErrorText error={error} /><MutationState mutation={mutation} />
    {uncertain ? <Notice tone="warning" message={copy("İşlem sonucu belirsiz. Yeniden göndermeden önce oturumu ve dosyaları bilgisayarda kontrol et.", "The result is uncertain. Check the session and files on the computer before sending again.")} /> : null}
    {selected ? <View style={{ gap: space.sm }}>
      <Button tone="quiet" label={copy("Dosyalara dön", "Back to files")} disabled={busy} onPress={() => setSelected(null)} />
      <Body mono>{selected.diff.relative}</Body>
      {selected.diff.binary || selected.diff.tooLarge || preview?.tooLarge ? <Notice message={copy("Bu dosya için satır farkı gösterilemiyor.", "Line diff is unavailable for this file.")} /> : preview ? <GitDiffViewer lines={preview.lines} /> : <Body muted>{copy("Diff hesaplanıyor…", "Computing diff…")}</Body>}
      {preview?.truncated ? <Notice message={copy("Fark önizlemesi kısaltıldı. Dosyanın tamamını bilgisayarda incele.", "The diff preview is truncated. Review the complete file on the computer.")} /> : null}
      {!checkpointReviewMatches(selected.status, selected.diff) ? <Notice tone="warning" message={copy("Checkpoint değişti. Dosyaları yenileyip tekrar incele.", "The checkpoint changed. Refresh and review the files again.")} /> : null}
      <FormActions submitLabel={copy("Değişiklikleri koru", "Keep changes")} disabled={disabled || !guarded || !checkpointReviewMatches(selected.status, selected.diff)} onSubmit={() => change(false)}
        cancelLabel={copy("Dosya değişikliklerini geri al", "Undo file changes")} cancelDisabled={disabled || !guarded || !checkpointReviewMatches(selected.status, selected.diff) || !selected.status.files.find((file) => file.relative === selected.diff.relative)?.undoable} onCancel={() => change(true)} />
    </View> : <>
      <QueryState query={query} empty={query.isSuccess && !query.data?.files.length} emptyTitle={copy("İncelenecek oturum değişikliği yok.", "No session changes to review.")} />
      <Button tone="quiet" label={copy("Yenile", "Refresh")} disabled={busy || !supported} onPress={() => { void query.refetch(); }} />
    </>}
    </View>} renderItem={({ item }) => item.kind === "file" ? <NavigationRow label={item.file.relative} detail={`${item.file.status} · +${item.file.additions} −${item.file.deletions}`} disabled={disabled || !item.file.exact}
        onPress={() => { const status = query.data; if (!status) return; void run(async () => {
          const result = await mutation.mutateAsync(checkpointRead(target, item.file.relative));
          setSelected({ status, diff: validateCheckpointDiff(result, item.file.relative) });
        }); }} /> : item.kind === "heading" ? <>
      <Body>{copy("Konuşmayı geri sar", "Rewind conversation")}</Body>
      <Body muted>{copy("Seçilen mesaj ve sonrasını konuşmadan kaldırır; dosyaları değiştirmez. Mesaj taslağa geri döner.", "Removes the selected message and later messages from the conversation; files stay unchanged. The prompt returns to the draft.")}</Body>
    </> : <NavigationRow label={item.block.text || copy("Ekli mesaj", "Message with attachments")} disabled={disabled || !rewindSupported}
        onPress={() => { try { setRewind(reviewRewind(session, item.block.id)); setError(null); } catch (cause) { setError(cause); } }} />} />
    {rewind ? <Sheet visible title={copy("Konuşmayı geri sar", "Rewind conversation")} size="full" scroll={false} dismissible={!busy} onClose={() => setRewind(null)}
      footer={<FormActions submitLabel={copy("Konuşmayı geri sar", "Rewind conversation")} disabled={disabled || !rewindSupported} busy={busy}
        onSubmit={() => { const review = rewind; void run(async () => { await onCommand(rewindCommand(session, review)); setRewind(null); onRefresh(); }, true); }}
        cancelLabel={copy("Vazgeç", "Cancel")} cancelDisabled={busy} onCancel={() => setRewind(null)} />}>
      <ScreenList data={session.session.blocks.filter((block) => rewind.affectedIds.includes(block.id))} keyExtractor={(block) => block.id}
        header={<View style={{ gap: space.sm }}><Body mono>{rewind.cwd}</Body><Body>{rewind.prompt}</Body>
          <Body>{copy("Kaldırılacak mesaj ve etkinlik sayısı: {p0}", "Messages and activities to remove: {p0}", { p0: rewind.affectedIds.length })}</Body><ErrorText error={error} /></View>}
        renderItem={({ item }) => <View style={{ gap: space.xs }}><Body muted>{item.role}</Body><Body>{item.text || item.id}</Body></View>} />
    </Sheet> : null}
  </Sheet>;
}
