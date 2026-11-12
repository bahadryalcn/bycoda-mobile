import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { ActionMenu, Body, Button, Disclosure, ErrorText, Field, FormActions, Notice, QueryState, SelectField, Sheet } from "@/ui/primitives";
import { CollectionToolbar } from "@/ui/search-field";
import { PrivateContentAccessProvider, usePrivateContentAccess } from "@/ui/private-access";
import type { HostBranches, HostWorktree, HostWorktrees } from "@/remote/types";
import { availableWorktreeBranches, readCreatedWorktree, unknownWorktreeResult, worktreeCreateRequest, type WorktreeCreateDraft, type WorktreeCreateScope } from "./worktree-create-model";
import { WorktreeCreateReview } from "./worktree-create-review";
import { FeatureUnavailable } from "./unavailable-state";

/** Hidden owners retain drafts and accepted results; hidden UI cannot authorize another action. */
export function WorktreeCreate({ scope, visible, blocked, beforeChange, onSelect, onClose }: {
  scope: WorktreeCreateScope; visible: boolean; blocked: boolean; beforeChange: () => Promise<unknown>; onSelect: (path: string) => void; onClose: () => void;
}) {
  const copy = useCopy(), machine = useActiveMachine(), connection = useConnectionScope(), access = usePrivateContentAccess();
  const [opening] = useState(() => ({ identity: { ...scope }, connection, machineName: machine?.name ?? machine?.id ?? "" }));
  const identity = opening.identity;
  const mounted = useRef(false), occupied = useRef(false), submitted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [draft, setDraft] = useState<WorktreeCreateDraft>({ branch: "", base: "HEAD", existing: false });
  const draftNow = useRef(draft); draftNow.current = draft;
  const [created, setCreated] = useState<HostWorktree | null>(null), createdNow = useRef<HostWorktree | null>(null);
  const [uncertain, setUncertain] = useState(false), [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false);
  const scopeCurrent = connection === opening.connection && opening.connection.isCurrent() && machine?.id === identity.machineId &&
    useMachines.getState().activeId === identity.machineId && scope.machineId === identity.machineId && scope.projectId === identity.projectId && scope.cwd === identity.cwd;
  const supported = scopeCurrent && !!machine?.capabilities?.includes("git.worktreeCreate");
  const available = supported && access.allowed && access.check();
  const branches = useHostQuery<HostBranches>(["branches", identity.projectId, identity.cwd], "git.branches", { projectId: identity.projectId, ...(identity.cwd ? { cwd: identity.cwd } : {}) }, { enabled: visible && available });
  const trees = useHostQuery<HostWorktrees>(["worktrees", identity.projectId], "git.worktrees", { projectId: identity.projectId }, { enabled: visible && available });
  const write = useHostMutation("git.worktreeCreate", ["worktrees", identity.projectId]);
  const privateFailureQuery = [branches, trees].find(query => query.error && ["auth", "identity"].includes((query.error as { kind?: string }).kind ?? ""));
  const privateFailure = !!privateFailureQuery;
  const sharedReadFailure = !!branches.error && !!trees.error && branches.error.message === trees.error.message &&
    (branches.error as { kind?: string }).kind === (trees.error as { kind?: string }).kind;
  const enabled = branches.isEnabled !== false && trees.isEnabled !== false;
  const readable = visible && available && enabled && branches.fetchStatus !== "paused" && trees.fetchStatus !== "paused" && !privateFailure;
  const readLease = useMemo(() => ({ active: false }), [readable]);
  useLayoutEffect(() => { readLease.active = true; return () => { readLease.active = false; }; }, [readLease]);
  const editorLease = useMemo(() => ({ active: false }), [visible, readable, created]);
  useLayoutEffect(() => { editorLease.active = true; return () => { editorLease.active = false; }; }, [editorLease]);
  const live = useRef({ available, visible, blocked, busy, uncertain, enabled, branches: branches.data, trees: trees.data, access });
  live.current = { available, visible, blocked, busy, uncertain, enabled, branches: branches.data, trees: trees.data, access };
  const originCurrent = () => mounted.current && live.current.available && opening.connection.isCurrent() && live.current.access.allowed && live.current.access.check() && useMachines.getState().activeId === identity.machineId;
  const current = () => readable && readLease.active && originCurrent() && live.current.visible;
  const disabled = blocked || busy || uncertain || !readable;
  const ready = readable && !!branches.data && !!trees.data && branches.isSuccess && trees.isSuccess && !branches.isError && !trees.isError;
  const sourcePath = identity.cwd || (readable ? trees.data?.worktrees.find(tree => tree.isMain)?.path : undefined) || identity.projectId;
  const lease = useMemo(() => ({ active: false }), [draft, disabled, ready, branches.data, trees.data, created]);
  useLayoutEffect(() => { lease.active = true; return () => { lease.active = false; }; }, [lease]);
  type Approval = { request: ReturnType<typeof worktreeCreateRequest>; sourcePath: string; defaultRoot?: string; lease: typeof lease };
  const [approval, setApproval] = useState<Approval | null>(null), issued = useRef<Approval | null>(null);
  useLayoutEffect(() => { if (issued.current && issued.current.lease !== lease) { issued.current = null; setApproval(null); } }, [lease]);
  useLayoutEffect(() => () => { issued.current = null; }, []);
  const close = () => { if (mounted.current && editorLease.active && live.current.visible && !occupied.current) onClose(); };
  const run = async (action: () => Promise<unknown>, creating = false) => {
    if (!current() || occupied.current || live.current.blocked || creating && live.current.uncertain) return;
    occupied.current = true; setBusy(true); setError(null);
    try { await action(); } catch (cause) { if (mounted.current) { setError(cause); if (creating && !createdNow.current && unknownWorktreeResult(cause)) setUncertain(true); } }
    finally { occupied.current = false; if (mounted.current) setBusy(false); }
  };
  const edit = (patch: Partial<WorktreeCreateDraft>) => {
    if (!current() || !editorLease.active || occupied.current || submitted.current || live.current.blocked || live.current.busy || live.current.uncertain) return;
    const next = { ...draftNow.current, ...patch }; draftNow.current = next; setDraft(next);
  };
  const refresh = () => {
    if (originCurrent() && live.current.visible && live.current.enabled && !occupied.current) { void branches.refetch(); void trees.refetch(); }
  };
  const start = () => {
    if (!current() || !lease.active || !ready || disabled || occupied.current || submitted.current || issued.current || draftNow.current !== draft || createdNow.current) return;
    try {
      const request = worktreeCreateRequest(identity, draft, branches.data!, trees.data!.worktrees);
      const next = { request, sourcePath, defaultRoot: trees.data!.defaultRoot, lease }; issued.current = next; setApproval(next);
    } catch (cause) { setError(cause); }
  };
  const confirm = () => {
    if (!approval || issued.current !== approval || approval.lease !== lease || !lease.active || disabled || !ready || !current() || occupied.current || submitted.current) return;
    issued.current = null; setApproval(null);
    void run(async () => {
      submitted.current = true;
      try {
        const result = readCreatedWorktree(await write.mutateAsync(approval.request), approval.request.branch);
        if (mounted.current) { createdNow.current = result; setCreated(result); await trees.refetch(); }
      } catch (cause) { if (!createdNow.current && !unknownWorktreeResult(cause)) submitted.current = false; throw cause; }
    }, true);
  };
  const useCreated = () => {
    if (!created || createdNow.current !== created || !current() || live.current.blocked || occupied.current) return;
    void run(async () => { await beforeChange(); if (!current() || live.current.blocked || createdNow.current !== created) return; onSelect(created.path); onClose(); });
  };
  const another = () => {
    if (!current() || occupied.current || live.current.blocked || !created || createdNow.current !== created) return;
    submitted.current = false; createdNow.current = null; setCreated(null); const empty = { branch: "", base: "HEAD", existing: false }; draftNow.current = empty; setDraft(empty); setError(null);
  };
  const unavailableMessage = !machine ? copy("Bilgisayar bağlantısını yeniden kurun ve bu projeyi tekrar açın.", "Reconnect the computer and reopen this project.")
    : !scopeCurrent ? copy("Bu işlemin bilgisayarını ve projesini yeniden açın. Worktree taslağı korunur.", "Reopen this operation's computer and project. The worktree draft is retained.")
      : !supported ? copy("Worktree oluşturmak için bilgisayardaki bycoda’yı güncelle.", "Update bycoda on this computer to create worktrees.")
        : copy("Kayıt erişimi kullanılamıyor. İlk bilgisayar ve proje bağlantısını kontrol edin.", "Record access is unavailable. Check the original computer and project connection.");
  const initialUnavailable = !available && !busy && !draft.branch && draft.base === "HEAD" && !draft.existing && !created && !uncertain && !error && !submitted.current;
  if (initialUnavailable) return <Sheet visible={visible} title={copy("Worktree oluştur", "Create worktree")} size="compact" onClose={close}>
    <FeatureUnavailable message={unavailableMessage} /><Button tone="quiet" label={copy("Kapat", "Close")} onPress={close} />
  </Sheet>;
  const feedback = <>{!uncertain ? <ErrorText error={error} /> : <Notice tone="warning" message={copy("Oluşturma sonucu belirsiz. Tekrar göndermeden çalışma klasörlerini yenileyip bilgisayarda kontrol et.", "The create result is uncertain. Refresh working folders and check the computer before sending again.")} />}</>;
  return <><Sheet visible={visible} title={copy("Worktree oluştur", "Create worktree")} size="form" dismissible={!busy} dirty={draft.branch !== "" || draft.existing || draft.base !== "HEAD"} onClose={close}>
    {readable ? <>
      <CollectionToolbar field={<Body selectable>{opening.machineName}</Body>} actions={<ActionMenu label={copy("Diğer işlemler", "More actions")} actions={[
        { key: "refresh", label: copy("Çalışma klasörlerini yenile", "Refresh working folders"), disabled: busy || !enabled, onPress: refresh },
        !!created && { key: "another", label: copy("Başka worktree oluştur", "Create another worktree"), disabled: busy || blocked, onPress: another },
      ]} />} />
      <Body mono selectable>{sourcePath}</Body>
      {created ? <><Body mono selectable>{created.path}</Body><Body selectable>{created.branch}</Body>
        <FormActions submitLabel={copy("Bu çalışma klasörünü kullan", "Use this working folder")} busy={busy} disabled={blocked || busy} onSubmit={useCreated} cancelLabel={copy("Kapat", "Close")} onCancel={close} feedback={feedback} />
      </> : <>
        <QueryState query={sharedReadFailure ? { ...branches, refetch: refresh } : branches} />{!sharedReadFailure ? <QueryState query={trees} /> : null}
        <SelectField label={copy("Dal seçimi", "Branch selection")} value={draft.existing ? "existing" : "new"} disabled={disabled || !!approval}
          options={[{ value: "new", label: copy("Yeni dal", "New branch") }, { value: "existing", label: copy("Mevcut yerel dal", "Existing local branch") }]}
          onChange={value => { const existing = value === "existing"; if (existing !== draftNow.current.existing) edit({ existing, branch: "" }); }} />
        {draft.existing ? <SelectField label={copy("Dal", "Branch")} value={draft.branch} disabled={disabled || !!approval} searchable options={availableWorktreeBranches(branches.data, trees.data?.worktrees ?? []).map(value => ({ value, label: value }))} onChange={branch => edit({ branch })} />
          : <><Field label={copy("Yeni dal adı", "New branch name")} value={draft.branch} maxLength={120} editable={!disabled && !approval} autoCapitalize="none" autoCorrect={false} onChangeText={branch => edit({ branch })} />
            <SelectField label={copy("Başlangıç dalı", "Base branch")} value={draft.base} disabled={disabled || !!approval} searchable options={[...new Set(["HEAD", ...(branches.data?.branches ?? []), ...(branches.data?.remotes ?? []).map(ref => `${ref.remote}/${ref.name}`)])].map(value => ({ value, label: value }))} onChange={base => edit({ base })} /></>}
        <FormActions submitLabel={uncertain ? copy("Çalışma klasörlerini yenile", "Refresh working folders") : copy("Worktree oluştur", "Create worktree")} busy={busy}
          disabled={uncertain ? busy || !enabled : disabled || !draft.branch.trim() || !ready || !!approval} onSubmit={uncertain ? refresh : start}
          cancelLabel={copy("Vazgeç", "Cancel")} cancelDisabled={busy} onCancel={close} feedback={feedback} />
      </>}
      <Disclosure label={copy("Ayrıntılar", "Details")}>{trees.data?.defaultRoot ? <Body muted mono selectable>{trees.data.defaultRoot}</Body> : null}{uncertain ? <ErrorText error={error} /> : null}</Disclosure>
    </> : <>
      {privateFailureQuery ? <QueryState query={{ ...privateFailureQuery, data: undefined, refetch: refresh }} /> : <FeatureUnavailable message={unavailableMessage} />}
      <FormActions submitLabel={copy("Çalışma klasörlerini yenile", "Refresh working folders")} disabled={!available || !enabled || busy} onSubmit={refresh} onCancel={close} cancelLabel={copy("Kapat", "Close")} />
    </>}
  </Sheet>
    <PrivateContentAccessProvider value={{ allowed: readable, check: current }}>
      {approval && approval.lease === lease && !disabled ? <WorktreeCreateReview request={approval.request} machineName={opening.machineName} sourcePath={approval.sourcePath} defaultRoot={approval.defaultRoot}
        onClose={() => { if (issued.current === approval) { issued.current = null; setApproval(null); } }} onConfirm={confirm} /> : null}
    </PrivateContentAccessProvider>
  </>;
}
