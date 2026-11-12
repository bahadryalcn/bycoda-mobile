import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { PrivateContentAccessProvider } from "@/ui/private-access";
import { useGitReviewScope, useGitReviewReadAccess } from "./use-git-review-access";
import { useGitWriteReview } from "./git-write-review";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { Body, Button, ErrorText, Notice, QueryState, ScreenList, Sheet, ToggleField } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import type { GitScope } from "./git-types";
import { selectiveReview, type SelectiveReview } from "./git-selective-query";
import { selectedStageContents, type SelectiveHunk, type SelectiveLine } from "./git-selective-model";
import { FeatureUnavailable } from "./unavailable-state";

export type GitSelectiveItemData = { kind: "hunk"; hunk: SelectiveHunk } | { kind: "line"; line: SelectiveLine };
export function GitSelectiveItem({ item, selected, disabled, onToggle }: { item: GitSelectiveItemData; selected: ReadonlySet<string>; disabled: boolean; onToggle: (ids: string[]) => void }) {
  const copy = useCopy();
  return item.kind === "hunk" ? <ToggleField label={copy("Hunk {p0}", "Hunk {p0}", { p0: Number(item.hunk.id) + 1 })} value={item.hunk.lines.every((line) => selected.has(line.id))} disabled={disabled} onChange={() => onToggle(item.hunk.lines.map((line) => line.id))} />
    : <ToggleField label={`${item.line.kind === "add" ? "+" : "−"} ${item.line.line}`} detail={item.line.text || copy("Boş satır", "Empty line")} value={selected.has(item.line.id)} disabled={disabled} onChange={() => onToggle([item.line.id])} />;
}

export function GitSelective({ scope, path, visible, busy: parentBusy, onBusyChange, onClose, onChanged, registerExit }: { scope: GitScope; path: string; visible: boolean; busy: boolean; onBusyChange: (busy: boolean) => void; onClose: () => void; onChanged: () => void; registerExit?: (exit: (() => void) | null) => void }) {
  const copy = useCopy(), scopeAccess = useGitReviewScope(scope, path, visible);
  const opening = scopeAccess.opening.scope, machineName = scopeAccess.opening.machineName;
  const [review, setReview] = useState<SelectiveReview | null>(null); const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false); const [done, setDone] = useState(false); const occupied = useRef(false); const submitted = useRef(false);
  const supported = scopeAccess.supported;
  const query = useHostQuery<SelectiveReview>(["git-selective", opening.projectId, opening.root, path], "workspace.run", { command: "git_management_snapshot", args: { cwd: opening.root } }, { enabled: scopeAccess.available, queryFn: (client, signal) => selectiveReview(client, opening, path, signal) });
  const readAccess = useGitReviewReadAccess(scopeAccess, query), current = readAccess.check;
  const latest = useRef({ review, selected }); latest.current = { review, selected };
  const mutation = useHostMutation("workspace.run", ["git", opening.projectId]);
  useEffect(() => { if (readAccess.allowed && !review && query.isSuccess && !query.isFetching && query.data) setReview(query.data); }, [query.data, query.isSuccess, query.isFetching, review, readAccess.allowed]);
  const stale = !!review && !!query.data && query.data.snapshot !== review.snapshot;
  const disabled = busy || parentBusy || sent || !readAccess.allowed || stale;
  const toggle = (ids: string[]) => { if (occupied.current || submitted.current || disabled || !current() || latest.current.review !== review) return; setSelected((before) => { const next = new Set(before); const all = ids.every((id) => next.has(id)); ids.forEach((id) => all ? next.delete(id) : next.add(id)); return next; }); };
  const submit = () => {
    if (occupied.current || submitted.current || disabled || !current() || !review || !selected.size) return;
    const request = { command: "git_stage_contents", args: { cwd: opening.root, relative: path, contents: selectedStageContents(review.diff.original, review.hunks, selected), expectedOriginal: review.diff.original, expectedCurrent: review.diff.current, expectedSnapshot: review.snapshot } };
    approval.open({ title: copy("Seçili satırları stage’e al", "Stage selected lines"), submitLabel: copy("Stage’e al", "Stage"), machineName, root: opening.root ?? "", path,
      detail: copy("Seçilen değişiklik sayısı: {p0}", "Selected changes: {p0}", { p0: selected.size }), contents: request.args.contents, request });
  };
  const owner = useMemo(() => ({ review, selected }), [review, selected]);
  const approval = useGitWriteReview<{ command: string; args: Record<string, unknown> }>(owner, disabled, current, request => {
    if (occupied.current || submitted.current || !current()) return;
    occupied.current = true; submitted.current = true; setBusy(true); setSent(true); onBusyChange(true); setError(null);
    void mutation.mutateAsync(request).then(() => { if (current()) { setDone(true); setSelected(new Set()); onChanged(); } }, reason => { if (scopeAccess.attached()) setError(reason); }).finally(() => { occupied.current = false; setBusy(false); onBusyChange(false); });
  });
  const close = useCallback(() => {
    if (!scopeAccess.attached() || occupied.current || latest.current.selected !== selected) return;
    if (approval.pending) { approval.cancel(); return; }
    if (!sent && selected.size) confirmAction(copy("Satır seçimlerini bırak?", "Discard line selections?"), copy("Dosyalar değiştirilmez.", "Files are not changed."), copy("Vazgeç", "Cancel"), () => { if (scopeAccess.attached() && latest.current.selected === selected) { setSelected(new Set()); onClose(); } });
    else onClose();
  }, [sent, selected, onClose, copy, approval.pending, readAccess.allowed]);
  useEffect(() => { registerExit?.(visible ? close : null); return () => registerExit?.(null); }, [visible, close, registerExit]);
  const rows: GitSelectiveItemData[] = (review?.hunks ?? []).flatMap((hunk) => [{ kind: "hunk" as const, hunk }, ...hunk.lines.map((line) => ({ kind: "line" as const, line }))]);
  return <><Sheet visible={visible} size="full" scroll={false} dismissible={!busy} title={copy("Değişiklikleri seç", "Select changes")}
    dirty={!sent && !!selected.size}
    discardTitle={copy("Satır seçimlerini bırak?", "Discard line selections?")}
    discardMessage={copy("Dosyalar değiştirilmez.", "Files are not changed.")}
    onClose={() => { if (scopeAccess.attached() && !occupied.current && latest.current.selected === selected) { setSelected(new Set()); onClose(); } }}
    footer={readAccess.allowed ? <Button tone="primary" label={copy("Seçili satırları stage’e al", "Stage selected lines")} disabled={disabled || !selected.size} busy={busy} onPress={submit} /> : undefined}>
    <ScreenList data={readAccess.allowed ? rows : []} keyExtractor={(row) => row.kind === "hunk" ? `hunk:${row.hunk.id}` : row.line.id}
      header={readAccess.allowed ? <View style={{ gap: space.sm }}><Body mono>{`${machineName}\n${opening.root}\n${path}`}</Body>
        <Notice message={copy("Yalnız seçilen ekleme ve silmeler Git index’ine yazılır. Çalışma dosyası korunur.", "Only selected additions and deletions are written to the Git index. The working file is preserved.")} />
        {!supported ? <FeatureUnavailable message={copy("Güvenli satır seçimi için bilgisayardaki bycoda’yı güncelle.", "Update bycoda on this computer for safe line selection.")} /> : <QueryState query={query} />}
        <ErrorText error={error} />{stale ? <Notice tone="warning" message={copy("İncelenen içerik değişti. Yenileyip tekrar inceleyin.", "Reviewed contents changed. Refresh and review again.")} /> : null}
        {sent ? <Notice tone={done ? "success" : "warning"} message={done ? copy("Seçili değişiklikler stage’e alındı.", "Selected changes were staged.") : copy("İşlem gönderildi. Tekrar göndermeden Git durumunu yenileyip incele.", "The action was sent. Refresh and review Git state before sending again.")} /> : null}
        <Button busy={query.isFetching} tone="quiet" label={copy("Güncel diff’i incele", "Review current diff")} disabled={busy || !supported || query.isFetching || !current()} onPress={() => { const captured = latest.current; if (!current()) return; void query.refetch().then((result) => { if (current() && latest.current.review === captured.review && latest.current.selected === captured.selected && result.data && !result.error) { setReview(result.data); setSelected(new Set()); if (done) { submitted.current = false; setSent(false); setDone(false); } } }); }} />
      </View> : <>{scopeAccess.available && query.error ? <QueryState query={{ ...query, data: undefined, refetch: () => { if (scopeAccess.check()) return query.refetch(); } }} /> : <FeatureUnavailable message={scopeAccess.scopeCurrent && !supported ? copy("Güvenli satır seçimi için bilgisayardaki bycoda’yı güncelle.", "Update bycoda on this computer for safe line selection.") : copy("Kayıt erişimi kullanılamıyor. İlk bilgisayar ve proje bağlantısını kontrol edin.", "Record access is unavailable. Check the original computer and project connection.")} />}</>} renderItem={({ item }) => <GitSelectiveItem item={item} selected={selected} disabled={disabled} onToggle={toggle} />} />
  </Sheet><PrivateContentAccessProvider value={readAccess}>{approval.element}</PrivateContentAccessProvider></>;
}
