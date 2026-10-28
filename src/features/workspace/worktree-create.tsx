import { useRef, useState } from "react";
import { View } from "react-native";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { Body, Button, ErrorText, Field, FormActions, Notice, QueryState, SelectField, Sheet } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import { confirmAction } from "@/ui/confirm";
import type { HostBranches, HostWorktree, HostWorktrees } from "@/remote/types";
import { availableWorktreeBranches, readCreatedWorktree, unknownWorktreeResult, worktreeCreateRequest, type WorktreeCreateScope } from "./worktree-create-model";

/** The parent keeps this owner mounted when hidden, retaining unknown-result and draft state. */
export function WorktreeCreate({ scope, visible, blocked, beforeChange, onSelect, onClose }: {
  scope: WorktreeCreateScope; visible: boolean; blocked: boolean; beforeChange: () => Promise<unknown>; onSelect: (path: string) => void; onClose: () => void;
}) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const [identity] = useState(scope);
  const supported = machine?.id === identity.machineId && machine.capabilities?.includes("git.worktreeCreate");
  const [branch, setBranch] = useState("");
  const [base, setBase] = useState("HEAD");
  const [existing, setExisting] = useState(false);
  const [created, setCreated] = useState<HostWorktree | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const occupied = useRef(false);
  const submitted = useRef(false);
  const branches = useHostQuery<HostBranches>(["branches", identity.projectId, identity.cwd], "git.branches", { projectId: identity.projectId, ...(identity.cwd ? { cwd: identity.cwd } : {}) }, { enabled: visible && !!supported });
  const trees = useHostQuery<HostWorktrees>(["worktrees", identity.projectId], "git.worktrees", { projectId: identity.projectId }, { enabled: visible && !!supported });
  const write = useHostMutation("git.worktreeCreate", ["worktrees", identity.projectId]);
  const current = () => useMachines.getState().activeId === identity.machineId && scope.machineId === identity.machineId && scope.projectId === identity.projectId && scope.cwd === identity.cwd;
  const disabled = blocked || busy || uncertain || !supported || !current();
  const run = async (action: () => Promise<unknown>, creating = false) => {
    if (occupied.current || blocked || !supported || !current() || creating && uncertain) return;
    occupied.current = true; setBusy(true); setError(null);
    try { await action(); } catch (cause) { setError(cause); if (creating && unknownWorktreeResult(cause)) setUncertain(true); }
    finally { occupied.current = false; setBusy(false); }
  };
  const unavailableMessage = !machine
    ? copy("Bilgisayar bağlantısını yeniden kurun ve bu projeyi tekrar açın.", "Reconnect the computer and reopen this project.")
    : !current() || machine.id !== identity.machineId
      ? copy("Bu işlemin bilgisayarını ve projesini yeniden açın. Worktree taslağı korunur.", "Reopen this operation's computer and project. The worktree draft is retained.")
      : copy("Worktree oluşturmak için bilgisayardaki bycoda’yı güncelle.", "Update bycoda on this computer to create worktrees.");
  const initialUnavailable = !supported && !busy && !branch && base === "HEAD" && !existing &&
    !created && !uncertain && !error && !submitted.current;
  if (initialUnavailable) return <Sheet visible={visible} title={copy("Worktree oluştur", "Create worktree")} size="compact" onClose={onClose}>
    <Body mono>{`${identity.machineId} · ${identity.cwd || identity.projectId}`}</Body>
    <Notice message={unavailableMessage} />
    <Button tone="quiet" label={copy("Kapat", "Close")} onPress={onClose} />
  </Sheet>;
  return <Sheet visible={visible} title={copy("Worktree oluştur", "Create worktree")} size="form" dirty={!created && !!branch} dismissible={!busy} onClose={onClose}>
    <Body mono>{identity.cwd || trees.data?.worktrees.find((tree) => tree.isMain)?.path || identity.projectId}</Body>
    {!supported ? <Notice message={unavailableMessage} /> : null}
    <ErrorText error={error} />
    {uncertain ? <Notice tone="warning" message={copy("Oluşturma sonucu belirsiz. Tekrar göndermeden çalışma klasörlerini yenileyip bilgisayarda kontrol et.", "The create result is uncertain. Refresh working folders and check the computer before sending again.")} /> : null}
    {created ? <View style={{ gap: space.sm }}><Body mono>{created.path}</Body><Body>{created.branch}</Body>
      <Button busy={busy} label={copy("Bu çalışma klasörünü kullan", "Use this working folder")} disabled={blocked || busy || !current()} onPress={() => { void run(async () => { await beforeChange(); if (!current()) throw new Error("The selected computer changed."); onSelect(created.path); onClose(); }); }} />
      <Button tone="quiet" label={copy("Başka worktree oluştur", "Create another worktree")} disabled={busy || blocked || !current()} onPress={() => { submitted.current = false; setCreated(null); setBranch(""); setBase("HEAD"); setExisting(false); }} />
    </View> : <>
      {supported ? <><QueryState query={branches} /><QueryState query={trees} /></> : null}
      <SelectField label={copy("Dal seçimi", "Branch selection")} value={existing ? "existing" : "new"} disabled={disabled} options={[{ value: "new", label: copy("Yeni dal", "New branch") }, { value: "existing", label: copy("Mevcut yerel dal", "Existing local branch") }]} onChange={(value) => { setExisting(value === "existing"); setBranch(""); }} />
      {existing ? <SelectField label={copy("Dal", "Branch")} value={branch} disabled={disabled} searchable options={availableWorktreeBranches(branches.data, trees.data?.worktrees ?? []).map((value) => ({ value, label: value }))} onChange={setBranch} />
        : <><Field label={copy("Yeni dal adı", "New branch name")} value={branch} maxLength={120} editable={!disabled} autoCapitalize="none" autoCorrect={false} onChangeText={setBranch} />
          <SelectField label={copy("Başlangıç dalı", "Base branch")} value={base} disabled={disabled} searchable options={[...new Set(["HEAD", ...(branches.data?.branches ?? []), ...(branches.data?.remotes ?? []).map((ref) => `${ref.remote}/${ref.name}`)])].map((value) => ({ value, label: value }))} onChange={setBase} /></>}
      {trees.data?.defaultRoot ? <Body muted mono>{trees.data.defaultRoot}</Body> : null}
      <FormActions submitLabel={copy("Worktree oluştur", "Create worktree")} busy={busy} disabled={disabled || !branch.trim() || !branches.isSuccess || !trees.isSuccess || branches.isError || trees.isError}
        onSubmit={() => {
          if (disabled || !branches.data || !trees.data || submitted.current) return;
          let request: ReturnType<typeof worktreeCreateRequest>;
          try { request = worktreeCreateRequest(identity, { branch, base, existing }, branches.data, trees.data.worktrees); }
          catch (cause) { setError(cause); return; }
          confirmAction(copy("Worktree oluştur", "Create worktree"),
            `${identity.cwd || trees.data.worktrees.find((tree) => tree.isMain)?.path || identity.projectId}\n\n${request.branch}\n${request.existing ? copy("Mevcut yerel dal", "Existing local branch") : request.base}\n\n${copy("Hedef klasörü bilgisayardaki bycoda belirler.", "bycoda on the computer chooses the destination folder.")}`,
            copy("Worktree oluştur", "Create worktree"), () => {
              if (submitted.current || !current()) return;
              void run(async () => {
                submitted.current = true;
                try { const result = readCreatedWorktree(await write.mutateAsync(request), request.branch); setCreated(result); await trees.refetch(); }
                catch (cause) { if (!unknownWorktreeResult(cause)) submitted.current = false; throw cause; }
              }, true);
            }, copy("Vazgeç", "Cancel"));
        }}
        cancelLabel={copy("Vazgeç", "Cancel")} cancelDisabled={busy} onCancel={onClose} />
    </>}
    <Button busy={trees.isFetching || branches.isFetching} tone="quiet" label={copy("Çalışma klasörlerini yenile", "Refresh working folders")} disabled={busy || !supported} onPress={() => { void trees.refetch(); void branches.refetch(); }} />
  </Sheet>;
}
