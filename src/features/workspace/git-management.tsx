import { useLocale } from "@/i18n";
import { matchesSearch } from "@/ui/search-matching";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useScreenBackHandler } from "@/ui/screen-back-handler";
import { useIsFocused } from "expo-router/react-navigation";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useConnectionScope } from "@/state/connection-scope";
import { usePrivateContentAccess } from "@/ui/private-access";
import { GitManagementReview, type GitManagementReviewContent } from "./git-management-review";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { confirmAction } from "@/ui/confirm";
import Pencil from "lucide-react-native/icons/pencil";
import Trash2 from "lucide-react-native/icons/trash-2";
import { ActionMenu, Body, Button, ErrorText, MutationState, NavigationRow, Notice, QueryState, ScreenList, SearchField, SegmentedControl, Sheet, StatusText } from "@/ui/primitives";
import { useProjectSubpage } from "./subpage-chrome";
import { space } from "@/ui/tokens";
import type { GitScope } from "./git-types";
import { useGitBranches, useGitIndex } from "./git-queries";
import { GitManagementForm, useGitManagementIssueText, useGitManagementLabels } from "./git-management-form";
import { GitManagementIssueError, gitManagementStateIssues, managementSnapshotRequest, managementDraft, pullRequestRepository, readGitRemotes, readGitTags, safeRemoteUrl, type GitManagementAction, type GitManagementDraft, type GitManagementIssue, type GitManagementRow, type GitManagementSnapshot } from "./git-management-model";
import { uncertainStashWrite } from "./git-stash-model";
import { FeatureUnavailable } from "./unavailable-state";

type Tab = "branches" | "tags" | "remotes" | "operations" | "pr";
type PullRequest = { number: number; title: string; url: string; state: string } | null;
type Editor = { opening: GitManagementDraft; value: GitManagementDraft; branch: string | null; head: string | null; snapshot: GitManagementSnapshot; repository?: string; touched: boolean };

type GitManagementProps = {
  scope: GitScope; initialTab?: Tab; onClose: () => void; onBusyChange: (busy: boolean) => void; registerExit: (exit: (() => void) | null) => void;
};

export function GitManagement({ scope, initialTab = "branches", onClose, onBusyChange, registerExit }: GitManagementProps) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const locale = useLocale();
  const labels = useGitManagementLabels();
  const issueText = useGitManagementIssueText();
  const machine = useActiveMachine();
  const connection = useConnectionScope();
  const [openingConnection] = useState(connection);
  const access = usePrivateContentAccess();
  const accessNow = useRef(access); accessNow.current = access;
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [machineId] = useState(machine?.id);
  const [machineName] = useState(machine?.name ?? "");
  const [openingScope] = useState(() => ({ ...scope }));
  const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [preflighting, setPreflighting] = useState(false);
  const occupied = useRef(false);
  const index = useGitIndex(openingScope);
  const branches = useGitBranches(openingScope);
  const supported = connection === openingConnection && openingConnection.isCurrent() && access.allowed && access.check() && machine?.id === machineId && !!machine?.capabilities?.includes("workspace.run") && !!machine.capabilities.includes("git.actions") && machine.capabilities.includes("git.management.snapshot.v1");
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
  const ready = supported && !!openingScope.root && !uncertain && index.isSuccess && snapshot.isSuccess && !!index.data && !!snapshot.data && index.isEnabled !== false && snapshot.isEnabled !== false && index.fetchStatus !== "paused" && snapshot.fetchStatus !== "paused";
  const authority = useMemo(() => ({ active: false }), [ready]);
  useLayoutEffect(() => { authority.active = true; return () => { authority.active = false; }; }, [authority]);
  const current = () => mounted.current && ready && authority.active && openingConnection.isCurrent() && accessNow.current.allowed && accessNow.current.check() && useMachines.getState().activeId === machineId;
  const unavailable = !ready || busy || occupied.current;
  const lease = useMemo(() => ({ active: false }), [editor, unavailable]);
  useLayoutEffect(() => { lease.active = true; return () => { lease.active = false; }; }, [lease]);
  type Review = { editor: Editor; lease: typeof lease; request: ReturnType<typeof managementSnapshotRequest>; content: GitManagementReviewContent };
  const [review, setReview] = useState<Review | null>(null);
  const reviewOwner = useRef<Review | null>(null);
  const editorNow = useRef(editor); editorNow.current = editor;
  useLayoutEffect(() => { if (reviewOwner.current && reviewOwner.current.lease !== lease) { reviewOwner.current = null; setReview(null); } }, [lease]);
  useLayoutEffect(() => () => { reviewOwner.current = null; }, []);
  const cancelReview = () => { reviewOwner.current = null; setReview(null); };
  const branchRows: GitManagementRow[] = [
    ...(branches.data?.branches ?? []).map((name) => ({ kind: "branch" as const, name, current: name === branches.data?.current })),
    ...(branches.data?.remotes ?? []).map((entry) => ({ kind: "branch" as const, name: entry.name, remote: entry.remote })),
  ];
  const rows = (tab === "branches" ? branchRows : tab === "tags" ? tags.data ?? [] : tab === "remotes" ? remotes.data ?? [] : [])
    .filter((row) => matchesSearch(`${row.remote ?? ""}/${row.name}`, search, locale));
  const open = (action: GitManagementAction, row?: GitManagementRow) => {
    if (unavailable || editor || !snapshot.data || !current()) return;
    const value = managementDraft(action, row);
    if (action === "createPr") value.head = index.data?.branch ?? "";
    setError(null); setEditor({ opening: structuredClone(value), value, branch: index.data?.branch ?? null, head: index.data?.head ?? null, snapshot: structuredClone(snapshot.data), repository: action === "createPr" ? destination.data : undefined, touched: false });
  };
  const close = useCallback(() => {
    if (occupied.current) return;
    if (reviewOwner.current) { reviewOwner.current = null; setReview(null); return; }
    if (editor) {
      if (JSON.stringify(editor.opening) !== JSON.stringify(editor.value)) confirmAction(copy("Git taslağını bırak?", "Leave Git draft?"),
        copy("Kaydedilmemiş işlem alanları bırakılacak. Depo değişmez.", "Unsaved action fields will be discarded. The repository stays unchanged."), copy("Vazgeç", "Cancel"), () => {
          if (mounted.current && !occupied.current && editorNow.current === editor) setEditor(null);
        });
      else setEditor(null);
      return;
    }
    onClose();
  }, [editor, onClose, copy]);
  useEffect(() => { registerExit(close); return () => registerExit(null); }, [close, registerExit]);
  useProjectSubpage(copy("Git yönetimi", "Git management"), close);
  const focused = useIsFocused();
  useScreenBackHandler(focused, close);
  let invalid: GitManagementIssue | undefined;
  if (editor) { try { managementSnapshotRequest(openingScope, editor.value, editor.snapshot); } catch (reason) { invalid = reason instanceof GitManagementIssueError ? reason.issue : "snapshotInvalid"; } }
  const shownIssue = invalid && (editor?.touched || gitManagementStateIssues.has(invalid)) ? issueText[invalid] : undefined;
  const submit = () => {
    if (!editor || unavailable || invalid || !current() || !lease.active || editorNow.current !== editor || reviewOwner.current) return;
    const captured = editor;
    const initialRequest = managementSnapshotRequest(openingScope, captured.value, captured.snapshot);
    if (captured.value.action === "createPr" && !captured.repository) return;
    const request = Object.freeze({ ...initialRequest, args: Object.freeze(structuredClone({ ...initialRequest.args, ...(captured.repository ? { repository: captured.repository } : {}) })) });
    const warning = captured.value.action === "reset" && captured.value.mode === "hard"
      ? copy("İzlenen dosyaların yerel değişiklikleri kalıcı olarak silinebilir.", "Local tracked-file changes may be permanently discarded.")
      : captured.value.action === "rebase" || captured.value.action === "reset" || captured.value.action === "undoCommit"
        ? copy("Mevcut dalın commit geçmişi değişir.", "The current branch commit history changes.")
        : captured.value.action === "deleteRemoteBranch" || captured.value.action === "createPr"
          ? copy("Uzak hizmet üzerinde yazma işlemi yapılır.", "This writes to the remote service.") : "";
    const next: Review = { editor: captured, lease, request, content: {
      title: labels[captured.value.action], machineName, root: openingScope.root ?? "", branch: captured.branch, head: captured.head,
      action: captured.value.action, args: request.args, warning, remotes: structuredClone(remotes.data ?? []),
    } };
    reviewOwner.current = next; setReview(next);
  };
  const confirmReview = () => {
    if (!review || reviewOwner.current !== review || review.lease !== lease || !lease.active || !current() || unavailable || editorNow.current !== review.editor) return;
    const captured = review.editor, request = review.request;
    reviewOwner.current = null; setReview(null);
    occupied.current = true; setPreflighting(true); onBusyChange(true);
    void index.refetch().then((fresh) => {
      if (fresh.error || !fresh.data || fresh.data.branch !== captured.branch || fresh.data.head !== captured.head) throw new Error(copy("Dal değişti. İşlemi yeniden inceleyin.", "The branch changed. Review the action again."));
      if (!current()) throw new Error(copy("Bilgisayar değişti. İşlemi yeniden inceleyin.", "The computer changed. Review the action again."));
      return mutation.mutateAsync(request);
    }).then(() => { setEditor(null); void branches.refetch(); void index.refetch(); if (tab === "tags") void tags.refetch(); if (tab === "remotes") void remotes.refetch(); if (tab === "pr") void pr.refetch(); })
      .catch((reason: unknown) => { setError(reason instanceof Error ? reason : new Error(String(reason))); void index.refetch(); })
      .finally(() => { occupied.current = false; setPreflighting(false); onBusyChange(false); void snapshot.refetch(); });
  };
  const refreshEditor = () => {
    if (!editor || occupied.current || uncertain || !current() || editorNow.current !== editor) return;
    cancelReview();
    const captured = editor;
    occupied.current = true; setPreflighting(true); onBusyChange(true);
    void Promise.all([index.refetch(), snapshot.refetch(), captured.value.action === "createPr" ? destination.refetch() : Promise.resolve(null)])
      .then(([nextIndex, nextSnapshot, nextDestination]) => {
        if (!current() || nextIndex.error || nextSnapshot.error || nextDestination?.error || !nextIndex.data || !nextSnapshot.data) return;
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
      scope={{ computer: machineName || undefined, project: openingScope.root?.split(/[\\/]/).filter(Boolean).at(-1) }}
      header={<View style={{ gap: space.sm }}>
        <Body mono muted selectable>{index.data?.branch ?? "HEAD"}</Body>
        {!supported && <FeatureUnavailable message={copy("Gelişmiş Git işlemleri için bilgisayardaki bycoda’yı güncelleyin.", "Update bycoda on this computer for advanced Git actions.")} />}
        <SegmentedControl hideLabel label={copy("Git yönetimi", "Git management")} value={tab} onChange={setTab} options={[
          { value: "branches", label: copy("Dallar", "Branches") }, { value: "tags", label: copy("Etiketler", "Tags") }, { value: "remotes", label: copy("Uzak depolar", "Remotes") },
          { value: "operations", label: copy("Geçmiş işlemleri", "History actions") }, { value: "pr", label: "PR" },
        ]} />
        {/* Header sections share one failure owner (the list scope): the first failing read reports
            compactly, later ones in one line. One feedback for the last action: an uncertain result
            replaces its own error, and a preflight error shows only when the action has none. */}
        <QueryState query={index} size="compact" /><QueryState query={snapshot} size="compact" />
        {uncertain
          ? <Notice tone="warning" message={copy("İşlem sonucu belirsiz. Yeniden işlem başlatmadan bilgisayardaki depo durumunu inceleyin.", "The result is uncertain. Review the repository on the computer before starting another action.")} />
          : <><MutationState mutation={mutation} />{mutation.error ? null : <ErrorText error={error} />}</>}
        {query && <QueryState query={query} size="compact" />}
        {tab === "branches" && <QueryState query={branches} size="compact" />}
        {["branches", "tags", "remotes"].includes(tab) && <SearchField label={copy("Ara", "Search")} value={search} onChangeText={setSearch} />}
        {tab === "tags" && <Button tone="quiet" label={labels.createTag} disabled={unavailable} onPress={() => open("createTag")} />}
        {tab === "remotes" && <Button tone="quiet" label={labels.addRemote} disabled={unavailable} onPress={() => open("addRemote")} />}
        {tab === "operations" && <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <View style={{ flex: 1, minWidth: 0 }}><NavigationRow variant="plain" label={copy("Dalları birleştir veya yeniden tabanla", "Merge or rebase branches")} detail={copy("Mevcut dal üzerinde çalışır", "Acts on the current branch")}
              onPress={() => open("merge")} /></View>
            <ActionMenu label={copy("Dal işlemi", "Branch action")} actions={["merge", "rebase"].map((action) => ({ key: action, label: labels[action as GitManagementAction], disabled: unavailable, onPress: () => open(action as GitManagementAction) }))} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <View style={{ flex: 1, minWidth: 0 }}><NavigationRow variant="plain" label={copy("Commit uygula veya tersine çevir", "Apply or revert a commit")} onPress={() => open("cherryPick")} /></View>
            <ActionMenu label={copy("Commit işlemi", "Commit action")} actions={["cherryPick", "revert"].map((action) => ({ key: action, label: labels[action as GitManagementAction], disabled: unavailable, onPress: () => open(action as GitManagementAction) }))} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <View style={{ flex: 1, minWidth: 0 }}><NavigationRow variant="plain" label={copy("Dal geçmişini geri al", "Undo branch history")} onPress={() => open("undoCommit")} /></View>
            <ActionMenu label={copy("Geçmişi değiştir", "Rewrite history")} actions={["undoCommit", "reset"].map((action) => ({ key: action, label: labels[action as GitManagementAction], destructive: true, disabled: unavailable, onPress: () => open(action as GitManagementAction) }))} />
          </View>
        </>}
        {tab === "pr" && <>
          <QueryState query={pr} size="compact" /><QueryState query={remotes} size="compact" /><QueryState query={destination} size="compact" />
          {destination.data && <Body mono>{destination.data}</Body>}
          {pr.data && <Body>{`#${pr.data.number} · ${pr.data.title}\n${pr.data.state}\n${pr.data.url}`}</Body>}
          {pr.isSuccess && !pr.data && <Body muted>{copy("Bu dal için pull request yok.", "No pull request for this branch.")}</Body>}
          <Button tone="quiet" label={labels.createPr} disabled={unavailable || !pr.isSuccess || !remotes.isSuccess || !remotes.data?.length || !destination.isSuccess} onPress={() => open("createPr")} />
        </>}
      </View>}
      renderItem={({ item }) => <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <View style={{ flex: 1, minWidth: 0 }}><NavigationRow variant="plain" label={`${item.remote ? `${item.remote}/` : ""}${item.name}`} detail={item.url ? safeRemoteUrl(item.url) : undefined}
        trailing={item.current ? <StatusText label={copy("Geçerli", "Current")} /> : undefined}
        onPress={() => open(item.kind === "remote" ? "removeRemote" : item.kind === "tag" ? "deleteTag" : item.remote ? "deleteRemoteBranch" : "renameBranch", item)}
        /></View>
        <ActionMenu label={copy("Kayıt işlemleri", "Entry actions")} actions={
          (item.kind === "remote" ? ["removeRemote"] : item.kind === "tag" ? ["deleteTag"] : item.remote ? ["deleteRemoteBranch"] : ["renameBranch", "deleteBranch"])
            .map((action) => ({ key: action, label: labels[action as GitManagementAction], icon: action === "renameBranch" ? <Pencil size={18} color={colors.muted} /> : <Trash2 size={18} color={colors.danger} />, destructive: action !== "renameBranch", reviewed: true, disabled: unavailable || (item.current && action === "deleteBranch"), onPress: () => open(action as GitManagementAction, item) }))} />
      </View>} />
    {editor && <Sheet visible size="form" title={labels[editor.value.action]} dirty={JSON.stringify(editor.opening) !== JSON.stringify(editor.value)} dismissible={!busy} onClose={() => { if (mounted.current && !occupied.current && editorNow.current === editor) { cancelReview(); setEditor(null); } }}
      discardTitle={copy("Git taslağını bırak?", "Leave Git draft?")}
      discardMessage={copy("Kaydedilmemiş işlem alanları bırakılacak. Depo değişmez.", "Unsaved action fields will be discarded. The repository stays unchanged.")}>
      <Body mono>{editor.branch ?? "HEAD"} · {editor.head}</Body>
      <Button tone="quiet" label={copy("Yenile", "Refresh")} busy={preflighting} disabled={busy || uncertain} onPress={refreshEditor} />
      <GitManagementForm value={editor.value} onChange={(value) => { if (mounted.current && !occupied.current && editorNow.current === editor) setEditor({ ...editor, value, touched: true }); }} busy={busy} disabled={unavailable || !!review} blocked={!!invalid} error={shownIssue}
        branchOptions={branchRows.map((row) => ({ value: row.remote ? `${row.remote}/${row.name}` : row.name, label: row.remote ? `${row.remote}/${row.name}` : row.name }))}
        onSubmit={submit} onCancel={close} feedback={<MutationState mutation={mutation} />} />
    </Sheet>}
    {review && review.lease === lease && !unavailable && review.editor === editor ? <GitManagementReview review={review.content} onClose={() => { if (reviewOwner.current === review) cancelReview(); }} onConfirm={confirmReview} /> : null}
  </>;
}
