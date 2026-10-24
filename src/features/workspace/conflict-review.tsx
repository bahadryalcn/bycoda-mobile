import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { Body, Button, ErrorText, Notice, QueryState, Row, ScreenList, SelectField, Sheet } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import type { GitScope } from "./git-types";
import { stableGitReview } from "./git-selective-query";
import { conflictParts, readConflictStages, resolveConflictParts, type ConflictChoice, type ConflictPart } from "./conflict-review-model";
import { GitDiffViewer } from "./git-diff-viewer";
import type { HostConflictStages } from "../../../../host/git-conflicts";
type Review = { snapshot: string; stages: HostConflictStages; working: string | null; parts: ConflictPart[] | null; workingError: unknown; operation: string | null };

export function ConflictChoiceField({ part, value, disabled, onChange }: { part: Extract<ConflictPart, { kind: "conflict" }>; value: ConflictChoice | ""; disabled: boolean; onChange: (value: ConflictChoice) => void }) {
  const copy = useCopy();
  return <SelectField label={copy("Çakışma bloğu {p0}", "Conflict block {p0}", { p0: Number(part.id) + 1 })} value={value} disabled={disabled} options={[{ value: "ours", label: copy("Bizim sürüm", "Our version") }, { value: "theirs", label: copy("Gelen sürüm", "Incoming version") }, { value: "both", label: copy("Önce bizim, sonra gelen", "Our version, then incoming") }]} onChange={(next) => onChange(next as ConflictChoice)} />;
}

export function ConflictReview({ scope, path, onClose, onBusyChange, onChanged, registerExit }: { scope: GitScope; path: string; onClose: () => void; onBusyChange: (busy: boolean) => void; onChanged: () => void; registerExit?: (exit: (() => void) | null) => void }) {
  const copy = useCopy(); const machine = useActiveMachine(); const [machineId] = useState(machine?.id); const [opening] = useState(() => ({ ...scope }));
  const [machineName] = useState(machine?.name ?? machine?.id ?? "");
  const [review, setReview] = useState<Review | null>(null); const [choices, setChoices] = useState<Record<string, ConflictChoice>>({}); const [version, setVersion] = useState("ours");
  const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false); const submitted = useRef(false);
  const current = () => useMachines.getState().activeId === machineId && opening.projectId === scope.projectId && opening.cwd === scope.cwd && opening.root === scope.root;
  const supported = !!machine && machine.id === machineId && machine.capabilities?.includes("git.selective.review");
  const query = useHostQuery<Review>(["git-conflict-review", opening.projectId, opening.root, path], "workspace.run", { command: "git_conflict_stages", args: { cwd: opening.root, relative: path } }, {
    enabled: !!supported,
    queryFn: async (client, signal) => {
      const stable = await stableGitReview(client, opening, async () => {
        const stages = readConflictStages(await client.request("workspace.run", { command: "git_conflict_stages", args: { cwd: opening.root, relative: path } }, { signal }), path);
        if ([stages.base, stages.ours, stages.theirs].some((text) => text && text.split("\n").length > 4000)) throw new Error("Conflict exceeds the mobile review budget");
        let working: string | null = null; let parts: ConflictPart[] | null = null; let workingError: unknown = null;
        if (!stages.binary && !stages.tooLarge && stages.workingExists) {
          try { working = await client.request<string>("files.read", { projectId: opening.projectId, cwd: opening.cwd, path }, { signal }); if (typeof working !== "string") throw new Error("Invalid working file review"); parts = conflictParts(working); }
          catch (cause) { workingError = cause; }
        }
        const operation = await client.request("workspace.run", { command: "git_operation_state", args: { cwd: opening.root } }, { signal });
        if (operation !== null && !["merge", "rebase", "cherry-pick", "revert"].includes(String(operation))) throw new Error("Invalid conflict operation");
        return { stages, working, parts, workingError, operation: operation as string | null };
      }, signal);
      return { snapshot: stable.snapshot, ...stable.value };
    },
  });
  const mutation = useHostMutation("workspace.run", ["git", opening.projectId]);
  const close = useCallback(() => {
    if (busy) return;
    if (!sent && Object.keys(choices).length) confirmAction(copy("Blok seçimlerini bırak?", "Discard block choices?"), copy("Dosyalar değiştirilmez.", "Files are not changed."), copy("Vazgeç", "Cancel"), onClose);
    else onClose();
  }, [busy, sent, choices, copy, onClose]);
  useEffect(() => { registerExit?.(close); return () => registerExit?.(null); }, [close, registerExit]);
  useEffect(() => { if (!review && query.isSuccess && !query.isFetching && query.data) setReview(query.data); }, [review, query.data, query.isSuccess, query.isFetching]);
  const safe = !!review && !review.stages.binary && !review.stages.tooLarge && !review.workingError;
  const disabled = busy || sent || !supported || !current() || !safe;
  let resolved: string | null = null;
  try { if (review?.parts) resolved = resolveConflictParts(review.parts, choices); } catch { /* Every block must have an explicit choice. */ }
  const blocks = review?.parts?.filter((part): part is Extract<ConflictPart, { kind: "conflict" }> => part.kind === "conflict") ?? [];
  const text = version === "result" ? resolved : version === "working" ? review?.working : review?.stages[version as "base" | "ours" | "theirs"];
  const send = (side: "ours" | "theirs" | "reviewed") => {
    if (disabled || !review || side === "reviewed" && (resolved === null || review.working === null)) return;
    const args = { cwd: opening.root, relative: path, side, expectedSnapshot: review.snapshot,
      ...(side === "reviewed" ? { contents: resolved, expectedCurrent: review.working } : {}) };
    const label = side === "ours" ? copy("Bizim sürümü kullan", "Use our version") : side === "theirs" ? copy("Gelen sürümü kullan", "Use incoming version") : copy("İncelenen çözümü uygula", "Apply reviewed resolution");
    const detail = side !== "reviewed" && review.stages[side] === null
      ? copy("Bu sürüm dosyayı çalışma klasöründen ve Git index’inden siler. Diğer dosyalar korunur.", "This version deletes the file from the working tree and Git index. Other files are preserved.")
      : copy("İncelenen çözüm çalışma dosyasına ve Git index’ine yazılır. Diğer dosyalar korunur.", "The reviewed resolution is written to the working file and Git index. Other files are preserved.");
    confirmAction(label, `${machineName}\n${opening.root}\n${path}\n\n${detail}`, label, () => {
      if (submitted.current || !current()) return;
      submitted.current = true; setSent(true); setBusy(true); onBusyChange(true); setError(null);
      void mutation.mutateAsync({ command: "git_resolve_conflict", args }).then(() => { onChanged(); onClose(); }, setError).finally(() => { setBusy(false); onBusyChange(false); });
    }, copy("Vazgeç", "Cancel"));
  };
  const refresh = () => { void query.refetch().then((value) => { if (value.data && !value.error) { setReview(value.data); setChoices({}); setVersion("ours"); } }); };
  return <Sheet visible size="full" scroll={false} title={copy("Çakışmayı incele", "Review conflict")} dismissible={!busy} onClose={close}
    footer={<View style={{ gap: space.sm }}>
      <Button label={copy("İncelenen çözümü uygula", "Apply reviewed resolution")} disabled={disabled || resolved === null} busy={busy} onPress={() => send("reviewed")} />
      <Row><Button tone="quiet" label={copy("Bizim sürümü kullan", "Use our version")} disabled={disabled} onPress={() => send("ours")} /><Button tone="quiet" label={copy("Gelen sürümü kullan", "Use incoming version")} disabled={disabled} onPress={() => send("theirs")} /></Row>
    </View>}>
    <ScreenList data={blocks} keyExtractor={(part) => part.id} header={<View style={{ gap: space.sm }}>
      <Body mono>{`${machineName}\n${opening.root}\n${path}`}</Body>
      <Notice message={copy("Ortak temel, bizim ve gelen sürümleri salt okunur incele. Her blok için bir tarafı veya ikisini seç.", "Review base, our and incoming versions read-only. Choose either side or both for each block.")} />
      {review?.operation === "rebase" ? <Notice message={copy("Rebase sırasında bizim sürüm hedef daldır; gelen sürüm yeniden uygulanan commit’tir.", "During a rebase, our version is the target branch; incoming is the commit being replayed.")} /> : null}
      {!supported ? <Notice message={copy("Güvenli çakışma incelemesi için bilgisayardaki bycoda’yı güncelle.", "Update bycoda on this computer for safe conflict review.")} /> : <QueryState query={query} />}
      <ErrorText error={error} />{review?.workingError ? <ErrorText error={review.workingError} /> : null}
      {review && !safe ? <Notice tone="warning" message={copy("İkili veya eksik içerikten çözüm uygulanamaz. Dosyanın tamamını bilgisayarda incele.", "A resolution cannot be applied from binary or incomplete content. Review the complete file on your computer.")} /> : null}
      {sent ? <Notice tone="warning" message={copy("İşlem gönderildi. Tekrar göndermeden Git durumunu yenileyip incele.", "The action was sent. Refresh and review Git state before sending again.")} /> : null}
      <Button tone="quiet" label={copy("Güncel çakışmayı incele", "Review current conflict")} disabled={busy || !supported || query.isFetching || !current()} onPress={() => { if (Object.keys(choices).length) confirmAction(copy("Blok seçimlerini bırak?", "Discard block choices?"), copy("Güncel sürüm yüklenir; dosyalar değiştirilmez.", "Loads the current version without changing files."), copy("Yenile", "Refresh"), refresh, copy("Vazgeç", "Cancel")); else refresh(); }} />
      <SelectField label={copy("Sürüm", "Version")} value={version} onChange={setVersion} options={[{ value: "base", label: copy("Ortak temel", "Common base") }, { value: "ours", label: copy("Bizim sürüm", "Our version") }, { value: "theirs", label: copy("Gelen sürüm", "Incoming version") }, { value: "working", label: copy("Çalışma dosyası", "Working file") }, { value: "result", label: copy("Çözüm önizlemesi", "Resolution preview") }]} />
      {text === null || text === undefined ? <Body muted>{copy("Bu sürüm mevcut değil veya henüz hazır değil.", "This version is absent or not ready yet.")}</Body> : <GitDiffViewer key={`${review?.snapshot}:${version}:${JSON.stringify(choices)}`} lines={text.split(/\r?\n/).map((line, index) => ({ kind: "same", text: line, oldLine: index + 1, newLine: index + 1 }))} />}
    </View>} renderItem={({ item }) => <ConflictChoiceField part={item} value={choices[item.id] ?? ""} disabled={disabled} onChange={(value) => setChoices((before) => ({ ...before, [item.id]: value }))} />} />
  </Sheet>;
}
