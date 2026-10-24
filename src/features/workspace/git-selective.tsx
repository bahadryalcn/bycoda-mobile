import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { Body, Button, ErrorText, Notice, QueryState, ScreenList, Sheet, ToggleField } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import type { GitScope } from "./git-types";
import { selectiveReview, type SelectiveReview } from "./git-selective-query";
import { selectedStageContents, type SelectiveHunk, type SelectiveLine } from "./git-selective-model";

export type GitSelectiveItemData = { kind: "hunk"; hunk: SelectiveHunk } | { kind: "line"; line: SelectiveLine };
export function GitSelectiveItem({ item, selected, disabled, onToggle }: { item: GitSelectiveItemData; selected: ReadonlySet<string>; disabled: boolean; onToggle: (ids: string[]) => void }) {
  const copy = useCopy();
  return item.kind === "hunk" ? <ToggleField label={copy("Hunk {p0}", "Hunk {p0}", { p0: Number(item.hunk.id) + 1 })} value={item.hunk.lines.every((line) => selected.has(line.id))} disabled={disabled} onChange={() => onToggle(item.hunk.lines.map((line) => line.id))} />
    : <ToggleField label={`${item.line.kind === "add" ? "+" : "−"} ${item.line.line}`} detail={item.line.text || copy("Boş satır", "Empty line")} value={selected.has(item.line.id)} disabled={disabled} onChange={() => onToggle([item.line.id])} />;
}

export function GitSelective({ scope, path, visible, busy: parentBusy, onBusyChange, onClose, onChanged, registerExit }: { scope: GitScope; path: string; visible: boolean; busy: boolean; onBusyChange: (busy: boolean) => void; onClose: () => void; onChanged: () => void; registerExit?: (exit: (() => void) | null) => void }) {
  const copy = useCopy(); const machine = useActiveMachine(); const [machineId] = useState(machine?.id); const [opening] = useState(() => ({ ...scope }));
  const [machineName] = useState(machine?.name ?? machine?.id ?? "");
  const [review, setReview] = useState<SelectiveReview | null>(null); const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false); const [done, setDone] = useState(false); const occupied = useRef(false); const submitted = useRef(false);
  const current = () => useMachines.getState().activeId === machineId && scope.projectId === opening.projectId && scope.root === opening.root && scope.cwd === opening.cwd;
  const supported = !!machine && machine.id === machineId && machine.capabilities?.includes("git.selective.review");
  const query = useHostQuery<SelectiveReview>(["git-selective", opening.projectId, opening.root, path], "workspace.run", { command: "git_management_snapshot", args: { cwd: opening.root } }, { enabled: visible && !!supported, queryFn: (client, signal) => selectiveReview(client, opening, path, signal) });
  const mutation = useHostMutation("workspace.run", ["git", opening.projectId]);
  const close = useCallback(() => {
    if (occupied.current) return;
    if (!sent && selected.size) confirmAction(copy("Satır seçimlerini bırak?", "Discard line selections?"), copy("Dosyalar değiştirilmez.", "Files are not changed."), copy("Vazgeç", "Cancel"), () => { setSelected(new Set()); onClose(); });
    else onClose();
  }, [sent, selected, onClose, copy]);
  useEffect(() => { registerExit?.(visible ? close : null); return () => registerExit?.(null); }, [visible, close, registerExit]);
  useEffect(() => { if (!review && query.isSuccess && !query.isFetching && query.data) setReview(query.data); }, [query.data, query.isSuccess, query.isFetching, review]);
  const disabled = busy || parentBusy || sent || !supported || !current();
  const toggle = (ids: string[]) => { if (disabled) return; setSelected((before) => { const next = new Set(before); const all = ids.every((id) => next.has(id)); ids.forEach((id) => all ? next.delete(id) : next.add(id)); return next; }); };
  const submit = () => {
    if (disabled || !review || !selected.size) return;
    const request = { command: "git_stage_contents", args: { cwd: opening.root, relative: path, contents: selectedStageContents(review.diff.original, review.hunks, selected), expectedOriginal: review.diff.original, expectedCurrent: review.diff.current, expectedSnapshot: review.snapshot } };
    confirmAction(copy("Seçili satırları stage’e al", "Stage selected lines"), `${machineName}\n${opening.root}\n${path}\n\n${copy("Seçilen değişiklik sayısı: {p0}", "Selected changes: {p0}", { p0: selected.size })}`, copy("Stage’e al", "Stage"), () => {
      if (occupied.current || submitted.current || !current()) return;
      occupied.current = true; submitted.current = true; setBusy(true); setSent(true); onBusyChange(true); setError(null);
      void mutation.mutateAsync(request).then(() => { setDone(true); setSelected(new Set()); onChanged(); }, setError).finally(() => { occupied.current = false; setBusy(false); onBusyChange(false); });
    }, copy("Vazgeç", "Cancel"));
  };
  const rows: GitSelectiveItemData[] = (review?.hunks ?? []).flatMap((hunk) => [{ kind: "hunk" as const, hunk }, ...hunk.lines.map((line) => ({ kind: "line" as const, line }))]);
  return <Sheet visible={visible} size="full" scroll={false} dismissible={!busy} title={copy("Değişiklikleri seç", "Select changes")} onClose={close}
    footer={<Button label={copy("Seçili satırları stage’e al", "Stage selected lines")} disabled={disabled || !selected.size} busy={busy} onPress={submit} />}>
    <ScreenList data={rows} keyExtractor={(row) => row.kind === "hunk" ? `hunk:${row.hunk.id}` : row.line.id}
      header={<View style={{ gap: space.sm }}><Body mono>{`${machineName}\n${opening.root}\n${path}`}</Body>
        <Notice message={copy("Yalnız seçilen ekleme ve silmeler Git index’ine yazılır. Çalışma dosyası korunur.", "Only selected additions and deletions are written to the Git index. The working file is preserved.")} />
        {!supported ? <Notice message={copy("Güvenli satır seçimi için bilgisayardaki bycoda’yı güncelle.", "Update bycoda on this computer for safe line selection.")} /> : <QueryState query={query} />}
        <ErrorText error={error} />
        {sent ? <Notice tone={done ? "success" : "warning"} message={done ? copy("Seçili değişiklikler stage’e alındı.", "Selected changes were staged.") : copy("İşlem gönderildi. Tekrar göndermeden Git durumunu yenileyip incele.", "The action was sent. Refresh and review Git state before sending again.")} /> : null}
        <Button tone="quiet" label={copy("Güncel diff’i incele", "Review current diff")} disabled={busy || !supported || query.isFetching || !current()} onPress={() => { void query.refetch().then((result) => { if (result.data && !result.error) { setReview(result.data); setSelected(new Set()); if (done) { submitted.current = false; setSent(false); setDone(false); } } }); }} />
      </View>} renderItem={({ item }) => <GitSelectiveItem item={item} selected={selected} disabled={disabled} onToggle={toggle} />} />
  </Sheet>;
}
