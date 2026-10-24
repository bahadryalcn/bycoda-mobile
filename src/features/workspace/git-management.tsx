import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { ActionMenu, Body, Button, ErrorText, MutationState, NavigationRow, Notice, QueryState, ScreenList, SearchField, SegmentedControl, Sheet } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import type { GitScope } from "./git-types";
import { useGitBranches, useGitIndex } from "./git-queries";
import { GitManagementForm, useGitManagementLabels } from "./git-management-form";
import { managementSnapshotRequest, managementDraft, pullRequestRepository, readGitRemotes, readGitTags, safeRemoteUrl, type GitManagementAction, type GitManagementDraft, type GitManagementRow, type GitManagementSnapshot } from "./git-management-model";
import { uncertainStashWrite } from "./git-stash-model";

type Tab = "branches" | "tags" | "remotes" | "operations" | "pr";
type PullRequest = { number: number; title: string; url: string; state: string } | null;
type Editor = { opening: GitManagementDraft; value: GitManagementDraft; branch: string | null; head: string | null; snapshot: GitManagementSnapshot; repository?: string };

export function GitManagement({ scope, onClose, onBusyChange, registerExit }: {
  scope: GitScope; onClose: () => void; onBusyChange: (busy: boolean) => void; registerExit: (exit: (() => void) | null) => void;
}) {
  const copy = useCopy();
  const labels = useGitManagementLabels();
  const machine = useActiveMachine();
  const [machineId] = useState(machine?.id);
  const [machineName] = useState(machine?.name ?? "");
  const [openingScope] = useState(() => ({ ...scope }));
  const [tab, setTab] = useState<Tab>("branches");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [preflighting, setPreflighting] = useState(false);
  const occupied = useRef(false);
  const index = useGitIndex(openingScope);
  const branches = useGitBranches(openingScope);
  const supported = machine?.id === machineId && !!machine?.capabilities?.includes("workspace.run") && !!machine.capabilities.includes("git.actions") && machine.capabilities.includes("git.management.snapshot.v1");
  const snapshot = useHostQuery<GitManagementSnapshot>(["git-management", openingScope.projectId, openingScope.root, "snapshot"], "workspace.run", { command: "git_management_snapshot", args: { cwd: openingScope.root } }, { enabled: supported });
  const tags = useHostQuery<GitManagementRow[]>(["git-management", openingScope.projectId, openingScope.root, "tags"], "workspace.run", {}, {
    enabled: supported && tab === "tags", queryFn: async (client, signal) => readGitTags(await client.request("workspace.run", { command: "git_tags", args: { cwd: openingScope.root } }, { signal })),
  });
  const remotes = useHostQuery<GitManagementRow[]>(["git-management", openingScope.projectId, openingScope.root, "remotes"], "workspace.run", {}, {
    enabled: supported && (tab === "remotes" || tab === "pr"), queryFn: async (client, signal) => readGitRemotes(await client.request("workspace.run", { command: "git_remotes", args: { cwd: openingScope.root } }, { signal })),
  });
  const pr = useHostQuery<PullRequest>(["git-management", openingScope.projectId, openingScope.root, "pr"], "workspace.run", { command: "git_pr_status", args: { cwd: openingScope.root } }, { enabled: supported && tab === "pr" });
  const destination = useHostQuery<string>(["git-management", openingScope.projectId, openingScope.root, "pr-destination"], "workspace.run", {}, { enabled: supported && tab === "pr",
    queryFn: async (client, signal) => pullRequestRepository(await client.request("workspace.run", { command: "git_pr_destination", args: { cwd: openingScope.root } }, { signal })),
  });
  const mutation = useHostMutation("workspace.run", ["git", openingScope.projectId]);
  const uncertain = uncertainStashWrite(mutation.error);
  const busy = preflighting || mutation.isPending;
  const unavailable = !supported || !openingScope.root || busy || occupied.current || uncertain || !index.isSuccess || !snapshot.isSuccess;
  const branchRows: GitManagementRow[] = [
    ...(branches.data?.branches ?? []).map((name) => ({ kind: "branch" as const, name, current: name === branches.data?.current })),
    ...(branches.data?.remotes ?? []).map((entry) => ({ kind: "branch" as const, name: entry.name, remote: entry.remote })),
  ];
  const rows = (tab === "branches" ? branchRows : tab === "tags" ? tags.data ?? [] : tab === "remotes" ? remotes.data ?? [] : [])
    .filter((row) => `${row.remote ?? ""}/${row.name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const open = (action: GitManagementAction, row?: GitManagementRow) => {
    if (unavailable || editor || !snapshot.data) return;
    const value = managementDraft(action, row);
    if (action === "createPr") value.head = index.data?.branch ?? "";
    setError(null); setEditor({ opening: structuredClone(value), value, branch: index.data?.branch ?? null, head: index.data?.head ?? null, snapshot: structuredClone(snapshot.data), repository: action === "createPr" ? destination.data : undefined });
  };
  const close = useCallback(() => {
    if (occupied.current) return;
    if (editor) {
      if (JSON.stringify(editor.opening) !== JSON.stringify(editor.value)) confirmAction(copy("Git taslağını bırak?", "Leave Git draft?"),
        copy("Kaydedilmemiş işlem alanları bırakılacak. Depo değişmez.", "Unsaved action fields will be discarded. The repository stays unchanged."), copy("Vazgeç", "Cancel"), () => setEditor(null));
      else setEditor(null);
      return;
    }
    onClose();
  }, [editor, onClose, copy]);
  useEffect(() => { registerExit(close); return () => registerExit(null); }, [close, registerExit]);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { close(); return true; });
    return () => subscription.remove();
  }, [close]));
  let invalid: string | undefined;
  if (editor) { try { managementSnapshotRequest(openingScope, editor.value, editor.snapshot); } catch (reason) { invalid = String((reason as Error).message); } }
  const submit = () => {
    if (!editor || unavailable || invalid) return;
    const captured = editor;
    const initialRequest = managementSnapshotRequest(openingScope, captured.value, captured.snapshot);
    if (captured.value.action === "createPr" && !captured.repository) return;
    const request = { ...initialRequest, args: { ...initialRequest.args, ...(captured.repository ? { repository: captured.repository } : {}) } };
    const target = Object.entries(request.args).filter(([key]) => key !== "cwd" && key !== "expectedSnapshot").map(([key, value]) => `${key}: ${key === "url" ? safeRemoteUrl(String(value)) : value}`).join("\n");
    const warning = captured.value.action === "reset" && captured.value.mode === "hard"
      ? copy("İzlenen dosyaların yerel değişiklikleri kalıcı olarak silinebilir.", "Local tracked-file changes may be permanently discarded.")
      : captured.value.action === "rebase" || captured.value.action === "reset" || captured.value.action === "undoCommit"
        ? copy("Mevcut dalın commit geçmişi değişir.", "The current branch commit history changes.")
        : captured.value.action === "deleteRemoteBranch" || captured.value.action === "createPr"
          ? copy("Uzak hizmet üzerinde yazma işlemi yapılır.", "This writes to the remote service.") : "";
    confirmAction(labels[captured.value.action], `${machineName}\n${openingScope.root}\n${copy("Mevcut dal", "Current branch")}: ${captured.branch ?? "HEAD"}\n${captured.head ?? ""}\n\n${target}\n${warning}\n${(remotes.data ?? []).map((remote) => `${remote.name}: ${safeRemoteUrl(remote.url ?? "")}`).join("\n")}`,
      labels[captured.value.action], () => {
        if (occupied.current || uncertain || useMachines.getState().activeId !== machineId) return;
        occupied.current = true; setPreflighting(true); onBusyChange(true);
        void index.refetch().then((fresh) => {
          if (fresh.error || !fresh.data || fresh.data.branch !== captured.branch || fresh.data.head !== captured.head) throw new Error(copy("Dal değişti. İşlemi yeniden inceleyin.", "The branch changed. Review the action again."));
          if (useMachines.getState().activeId !== machineId) throw new Error(copy("Bilgisayar değişti. İşlemi yeniden inceleyin.", "The computer changed. Review the action again."));
          return mutation.mutateAsync(request);
        }).then(() => { setEditor(null); void branches.refetch(); void index.refetch(); if (tab === "tags") void tags.refetch(); if (tab === "remotes") void remotes.refetch(); if (tab === "pr") void pr.refetch(); })
          .catch((reason: unknown) => { setError(reason instanceof Error ? reason : new Error(String(reason))); void index.refetch(); })
          .finally(() => { occupied.current = false; setPreflighting(false); onBusyChange(false); void snapshot.refetch(); });
      }, copy("Vazgeç", "Cancel"));
  };
  const refreshEditor = () => {
    if (!editor || occupied.current || uncertain || useMachines.getState().activeId !== machineId) return;
    const captured = editor;
    occupied.current = true; setPreflighting(true); onBusyChange(true);
    void Promise.all([index.refetch(), snapshot.refetch(), captured.value.action === "createPr" ? destination.refetch() : Promise.resolve(null)])
      .then(([nextIndex, nextSnapshot, nextDestination]) => {
        if (useMachines.getState().activeId !== machineId || nextIndex.error || nextSnapshot.error || nextDestination?.error || !nextIndex.data || !nextSnapshot.data) return;
        setEditor({ ...captured, branch: nextIndex.data.branch, head: nextIndex.data.head, snapshot: structuredClone(nextSnapshot.data),
          repository: nextDestination?.data ?? captured.repository });
        mutation.reset();
        setError(null);
      }).catch((reason: unknown) => setError(reason instanceof Error ? reason : new Error(String(reason))))
      .finally(() => { occupied.current = false; setPreflighting(false); onBusyChange(false); });
  };
  const query = tab === "tags" ? tags : tab === "remotes" ? remotes : undefined;
  return <>
    <ScreenList<GitManagementRow> data={rows} keyExtractor={(row) => `${row.kind}:${row.remote ?? ""}:${row.name}`} query={query}
      header={<View style={{ gap: space.sm }}>
        <Button tone="quiet" label={copy("Geri", "Back")} disabled={busy} onPress={close} />
        <Body mono>{openingScope.root}</Body><Body>{machineName} · {index.data?.branch ?? "HEAD"}</Body>
        {!supported && <Notice message={copy("Gelişmiş Git işlemleri için bilgisayardaki bycoda’yı güncelleyin.", "Update bycoda on this computer for advanced Git actions.")} />}
        <SegmentedControl label={copy("Git yönetimi", "Git management")} value={tab} onChange={setTab} options={[
          { value: "branches", label: copy("Dallar", "Branches") }, { value: "tags", label: copy("Etiketler", "Tags") }, { value: "remotes", label: copy("Uzak depolar", "Remotes") },
          { value: "operations", label: copy("Geçmiş işlemleri", "History actions") }, { value: "pr", label: "PR" },
        ]} />
        <QueryState query={index} /><QueryState query={snapshot} /><MutationState mutation={mutation} /><ErrorText error={error} />
        {uncertain && <Notice tone="warning" message={copy("İşlem sonucu belirsiz. Yeniden işlem başlatmadan bilgisayardaki depo durumunu inceleyin.", "The result is uncertain. Review the repository on the computer before starting another action.")} />}
        {query && <QueryState query={query} />}
        {tab === "branches" && <QueryState query={branches} />}
        {["branches", "tags", "remotes"].includes(tab) && <SearchField label={copy("Ara", "Search")} value={search} onChangeText={setSearch} />}
        {tab === "tags" && <Button tone="quiet" label={labels.createTag} disabled={unavailable} onPress={() => open("createTag")} />}
        {tab === "remotes" && <Button tone="quiet" label={labels.addRemote} disabled={unavailable} onPress={() => open("addRemote")} />}
        {tab === "operations" && <>
          <NavigationRow label={copy("Dalları birleştir veya yeniden tabanla", "Merge or rebase branches")} detail={copy("Mevcut dal üzerinde çalışır", "Acts on the current branch")}
            onPress={() => open("merge")} trailing={<ActionMenu label={copy("Dal işlemi", "Branch action")} actions={["merge", "rebase"].map((action) => ({ key: action, label: labels[action as GitManagementAction], disabled: unavailable, onPress: () => open(action as GitManagementAction) }))} />} />
          <NavigationRow label={copy("Commit uygula veya tersine çevir", "Apply or revert a commit")} onPress={() => open("cherryPick")}
            trailing={<ActionMenu label={copy("Commit işlemi", "Commit action")} actions={["cherryPick", "revert"].map((action) => ({ key: action, label: labels[action as GitManagementAction], disabled: unavailable, onPress: () => open(action as GitManagementAction) }))} />} />
          <NavigationRow label={copy("Dal geçmişini geri al", "Undo branch history")} onPress={() => open("undoCommit")}
            trailing={<ActionMenu label={copy("Geçmişi değiştir", "Rewrite history")} actions={["undoCommit", "reset"].map((action) => ({ key: action, label: labels[action as GitManagementAction], destructive: true, disabled: unavailable, onPress: () => open(action as GitManagementAction) }))} />} />
        </>}
        {tab === "pr" && <>
          <QueryState query={pr} /><QueryState query={remotes} /><QueryState query={destination} />
          {destination.data && <Body mono>{destination.data}</Body>}
          {pr.data && <Body>{`#${pr.data.number} · ${pr.data.title}\n${pr.data.state}\n${pr.data.url}`}</Body>}
          {pr.isSuccess && !pr.data && <Body muted>{copy("Bu dal için pull request yok.", "No pull request for this branch.")}</Body>}
          <Button tone="quiet" label={labels.createPr} disabled={unavailable || !pr.isSuccess || !remotes.isSuccess || !remotes.data?.length || !destination.isSuccess} onPress={() => open("createPr")} />
        </>}
      </View>}
      renderItem={({ item }) => <NavigationRow label={`${item.remote ? `${item.remote}/` : ""}${item.name}${item.current ? " · HEAD" : ""}`} detail={item.url ? safeRemoteUrl(item.url) : undefined}
        onPress={() => open(item.kind === "remote" ? "removeRemote" : item.kind === "tag" ? "deleteTag" : item.remote ? "deleteRemoteBranch" : "renameBranch", item)}
        trailing={<ActionMenu label={copy("Kayıt işlemleri", "Entry actions")} actions={
          (item.kind === "remote" ? ["removeRemote"] : item.kind === "tag" ? ["deleteTag"] : item.remote ? ["deleteRemoteBranch"] : ["renameBranch", "deleteBranch"])
            .map((action) => ({ key: action, label: labels[action as GitManagementAction], destructive: action !== "renameBranch", disabled: unavailable || (item.current && action === "deleteBranch"), onPress: () => open(action as GitManagementAction, item) }))} />} />} />
    {editor && <Sheet visible size="form" title={labels[editor.value.action]} dirty={JSON.stringify(editor.opening) !== JSON.stringify(editor.value)} dismissible={!busy} onClose={close}>
      <Body mono>{editor.branch ?? "HEAD"} · {editor.head}</Body>
      <Button tone="quiet" label={copy("Yenile", "Refresh")} busy={preflighting} disabled={busy || uncertain} onPress={refreshEditor} />
      <GitManagementForm value={editor.value} onChange={(value) => { if (!occupied.current) setEditor({ ...editor, value }); }} busy={busy} disabled={unavailable} error={invalid}
        branchOptions={branchRows.map((row) => ({ value: row.remote ? `${row.remote}/${row.name}` : row.name, label: row.remote ? `${row.remote}/${row.name}` : row.name }))}
        onSubmit={submit} onCancel={close} feedback={<MutationState mutation={mutation} />} />
    </Sheet>}
  </>;
}
