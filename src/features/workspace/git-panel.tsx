import { useMobileTheme } from "@/ui/theme";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { View } from "react-native";
import { useScreenBackHandler } from "@/ui/screen-back-handler";
import { useIsFocused } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import {
  ErrorNotice,
  QueryState,
  Screen,
  ScreenList,
  SearchField,
  SectionHeader,
  Sheet,
  NoResults,
  StateView,
} from "@/ui/primitives";
import { InScreenBack } from "@/ui/in-screen-back";
import { haptic } from "@/ui/motion";
import { useCopy } from "@/ui/copy";
import { useActiveMachine } from "@/state/machines";
import { useGitActions } from "./git-actions";
import { GitBranchesPanel } from "./git-branches";
import { GitChangeGroupHeader, GitCommitBar } from "./git-changes";
import { gitPushTarget } from "./git-commit-model";
import { useGitCommitGeneration } from "./use-git-commit-generation";
import { GitConfirmationReview } from "./git-confirmation";
import { GitDiffPanel } from "./git-diff";
import { GitHistoryPanel } from "./git-history";
import { GitStashes } from "./git-stashes";
import { GitManagement } from "./git-management";
import { GitDeliverySheet } from "./git-delivery";
import { isManagedBranch } from "./git-branch-name";
import { ConflictReview } from "./conflict-review";
import { GitActionsSheet } from "./git-actions-sheet";
import { GitLinkPullRequestSheet, useLinkedPullRequest } from "./git-link-pr";
import { GitFileOptionsSheet, GitFileSwipeRow } from "./git-file-swipe";
import { useGitIndex } from "./git-queries";
import {
  GitActionFeedback,
  GitConflictsPanel,
  GitHeader,
  GitOperationPanel,
} from "./git-status";
import { GroupedListRow } from "./shared";
import { gitReducer, initialGitState, type GitConfirmation } from "./workspace-state";
import type { GitFileAction, GitScope, ProjectGitProps } from "./git-types";
import type { GitChangedFile } from "./wire";
import { gitListRows, type GitChangeGroup, type GitListFilter, type GitListRow } from "./git-list-model";
import { registerWorkspaceDraft } from "./draft-guard";
import { DraftWriteError } from "./draft-store";
import { useLocalDraft } from "./use-local-draft";
import { space } from "@/ui/tokens";
import { useCollapsibleSearch } from "@/ui/search-field";
import { FilterChipRow } from "@/ui/filter-sheet";
import { useScreenContentInsets } from "@/ui/screen-content-insets";
import { pushOnce } from "@/ui/navigation";

type GitDraft = { message: string; branchName: string };
function decodeDraft(value: string): GitDraft {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed?.message !== "string" || typeof parsed?.branchName !== "string")
      throw new Error("Invalid Git draft.");
    return { message: parsed.message.slice(0, 64000), branchName: parsed.branchName.slice(0, 300) };
  } catch {
    throw new Error("Saved Git draft could not be read.");
  }
}
const encodeDraft = (value: GitDraft | null) =>
  value && (value.message || value.branchName) ? JSON.stringify(value) : null;
export function ProjectGit({ projectId, cwd, root, onOpenFile, onDraftGuard, hideDraftWriteWarning }: ProjectGitProps) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const gutter = useScreenContentInsets();
  const manageConnections = () => pushOnce("/machines");
  const machine = useActiveMachine();
  const scope = useMemo<GitScope>(() => ({ projectId, cwd, root }), [projectId, cwd, root]);
  const index = useGitIndex(scope);
  const actions = useGitActions(scope);
  const [state, dispatch] = useReducer(gitReducer, initialGitState);
  const [confirmationError, setConfirmationError] = useState<Error | null>(null);
  const [fileQuery, setFileQuery] = useState("");
  const [fileFilter, setFileFilter] = useState<GitListFilter>("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const [fileOptions, setFileOptions] = useState<{ file: GitChangedFile; staged: boolean } | null>(null);
  const [linkPrOpen, setLinkPrOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const prLink = useLinkedPullRequest(scope);
  const showBranches = () => dispatch({ type: "view", view: { kind: "branches" } });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [stashesOpen, setStashesOpen] = useState(false);
  const [managementOpen, setManagementOpen] = useState(false);
  const [managementTab, setManagementTab] = useState<"branches" | "pr">("branches");
  const [conflictReview, setConflictReview] = useState<string | null>(null);
  // The commit confirmation that was opened by "Stage all & commit"; confirming stages first.
  const stageAllReview = useRef<GitConfirmation | null>(null);
  const gitReviewExit = useRef<(() => void) | null>(null);
  const managementExit = useRef<(() => void) | null>(null);
  const [stashWrite, setStashWrite] = useState<{ scope: string; busy: boolean } | null>(null);
  const stashExit = useRef<(() => void) | null>(null);
  const historyExit = useRef<(() => void) | null>(null);
  const stashScope = JSON.stringify([machine?.id, projectId, cwd, root]);
  const draftKey = "bycoda.mobile.git-draft.v1:" + JSON.stringify([machine?.id, projectId, cwd]);
  const draft = useLocalDraft<GitDraft>(draftKey, decodeDraft, encodeDraft);
  const { message = "", branchName = "" } = draft.value ?? {};
  const hasDraft = !!(message || branchName);
  const busy = actions.busy || (stashWrite?.scope === stashScope && stashWrite.busy);
  const data = index.data;
  const generation = useGitCommitGeneration(scope, data);
  const [sections, setSections] = useState<{ scope: string; collapsed: GitChangeGroup[] }>({
    scope: stashScope, collapsed: [],
  });
  const collapsed = sections.scope === stashScope ? sections.collapsed : undefined;
  const toggleGroup = (group: GitChangeGroup) => setSections((current) => {
    const groups = current.scope === stashScope ? current.collapsed : [];
    return { scope: stashScope, collapsed: groups.includes(group)
      ? groups.filter((value) => value !== group) : [...groups, group] };
  });
  const branchPicker = state.view.kind === "branches";
  const selection = state.view.kind === "diff" ? state.view.selection : null;
  const showFiles = useCallback(() => dispatch({ type: "view", view: { kind: "files" } }), []);
  const persist = draft.persist;
  useEffect(() => {
    const guard = async () => {
      if (busy)
        throw new Error(
          copy(
            "Git işlemi sürüyor. Bitmesini bekle.",
            "A Git action is running. Wait for it to finish.",
          ),
        );
      if (!draft.ready) {
        if (draft.error) throw draft.error;
        return;
      }
      await persist();
    };
    onDraftGuard?.(busy || hasDraft || !!draft.error ? guard : null);
    const unregister = busy || hasDraft ? registerWorkspaceDraft(draftKey, guard) : undefined;
    return () => {
      onDraftGuard?.(null);
      unregister?.();
    };
  }, [busy, hasDraft, draft.ready, draft.error, persist, draftKey, onDraftGuard, copy]);
  const inSubview = !!selection || historyOpen || stashesOpen || managementOpen || !!conflictReview;
  // Leaves the innermost in-screen sub-view; false when the list itself is showing.
  const exitSubview = () => {
    if (historyOpen) { if (historyExit.current) historyExit.current(); else setHistoryOpen(false); }
    else if (stashesOpen) stashExit.current?.();
    else if (managementOpen) managementExit.current?.();
    else if (gitReviewExit.current) gitReviewExit.current();
    else if (selection) showFiles();
    else return false;
    return true;
  };
  // The native swipe is off while a sub-view or a running action owns back, so it never reveals
  // the previous route; the edge swipe and the Android back button run the same exit.
  const edge = <InScreenBack active={inSubview || busy} onBack={() => { if (!busy) exitSubview(); }} />;
  usePreventRemove(busy || hasDraft || inSubview, ({ repeat }) => {
    if (busy) return;
    if (exitSubview()) return;
    // Reason: a draft that cannot be saved must never trap the user on this screen; leave anyway.
    // `repeat` lifts the prevention first: a kept draft would otherwise prevent the retried Back again.
    void persist()
      .catch(() => {})
      .then(() => repeat());
  });
  const focused = useIsFocused();
  useScreenBackHandler(focused && !!selection && !state.confirmation, () => {
    if (!busy) { if (gitReviewExit.current) gitReviewExit.current(); else showFiles(); }
  });
  const patchDraft = (patch: Partial<GitDraft>) =>
    draft.setValue((current) => ({ message: "", branchName: "", ...current, ...patch }));
  // Files a commit would record: the staged ones, or every changed file for "Stage all & commit".
  const reviewFiles = (stageAll: boolean) =>
    (data?.files ?? [])
      .filter((file) => (stageAll ? file.staged || file.unstaged : file.staged))
      .map((file) => file.relative)
      .sort();
  const choose = (confirmation: GitConfirmation, stageAll = false) => {
    if (busy || !draft.ready) return;
    // Managed branches refuse a direct push; offer the reviewed delivery flow instead.
    if (confirmation.kind === "push" && isManagedBranch(data?.branch)) {
      setDeliveryOpen(true);
      return;
    }
    setConfirmationError(null);
    const next: GitConfirmation = {
      ...confirmation,
      context: {
        machine: machine?.name ?? "",
        root: root ?? cwd ?? "",
        branch: data?.branch ?? null,
        message,
        files: reviewFiles(stageAll),
        pushTarget: gitPushTarget(data?.upstream, data?.remote, data?.branch),
        ahead: data?.ahead ?? 0,
      },
    };
    stageAllReview.current = stageAll ? next : null;
    dispatch({ type: "confirm", confirmation: next });
  };
  const runFileAction = (value: GitFileAction, path?: string) => {
    if (busy) return;
    void actions
      .runFileAction(value, path)
      .then(() => {
        if (path && (value === "stage" || value === "unstage")) dispatch({ type: "staged", path });
      })
      .catch(() => {});
  };
  const createBranch = () => {
    if (busy || !draft.ready) return;
    const submitted = branchName;
    void actions
      .createNamedBranch(submitted.trim())
      .then(() => {
        haptic.success();
        draft.setValue((current) => ({
          message: current?.message ?? "",
          branchName: current?.branchName === submitted ? "" : (current?.branchName ?? ""),
        }));
      })
      .catch(() => {});
  };
  const confirm = () => {
    const confirmation = state.confirmation;
    if (!confirmation || busy) return;
    const context = confirmation.context;
    if (
      context &&
      (context.branch !== (data?.branch ?? null) ||
        (confirmation.kind === "commit" &&
          JSON.stringify(context.files) !==
            JSON.stringify(reviewFiles(stageAllReview.current === confirmation))))
    ) {
      setConfirmationError(
        new Error(
          copy(
            "Git durumu değişti. Bu pencereyi kapatıp değişiklikleri yeniden incele.",
            "Git state changed. Close this dialog and review the changes again.",
          ),
        ),
      );
      return;
    }
    void actions
      .executeConfirmation(
        confirmation,
        context?.message ?? message,
        stageAllReview.current === confirmation,
      )
      .then(() => {
        dispatch({ type: "completed", confirmation });
        if (confirmation.kind === "commit") haptic.success();
        if (confirmation.kind === "commit")
          draft.setValue((current) => ({
            branchName: current?.branchName ?? "",
            message: current?.message === context?.message ? "" : (current?.message ?? ""),
          }));
      })
      .catch(() => {});
  };
  const feedback = (
    <GitActionFeedback
      action={actions.action}
      extended={actions.extended}
      createBranch={actions.createBranch}
      switchBranch={actions.switchBranch}
    />
  );
  const draftStatus = (
    <>
      <ErrorNotice
        error={hideDraftWriteWarning && draft.error instanceof DraftWriteError ? null : draft.error}
        message={
          !draft.ready
            ? copy("Kaydedilmiş Git taslağı okunamadı.", "Saved Git draft could not be read.")
            : undefined
        }
        onRetry={() => {
          void (draft.ready ? persist() : draft.load()).catch(() => {});
        }}
      />
      {!draft.ready && !draft.error && !index.isPending ? (
        <QueryState query={{ isPending: true }} loading="inline" />
      ) : null}
    </>
  );
  const filtered = !!fileQuery.trim() || fileFilter !== "all";
  const rows = useMemo(
    () => (selection ? [] : gitListRows(data?.files ?? [], fileQuery, fileFilter, collapsed)),
    [data?.files, fileQuery, fileFilter, selection, collapsed],
  );
  // Search and the staged filter share the one collection sheet; the icons sit beside the branch card.
  const fileSearch = useCollapsibleSearch(
    <SearchField label={copy("Değişen dosyalarda ara", "Search changed files")} value={fileQuery} maxLength={200} onChangeText={setFileQuery} />,
    {
      activeFilters: fileFilter !== "all" ? 1 : 0,
      onResetFilters: () => setFileFilter("all"),
      filters: <>
        <SectionHeader title={copy("Göster", "Show")} />
        <FilterChipRow wrap label={copy("Değişiklik filtreleri", "Change filters")} value={fileFilter}
          options={[
            { value: "all", label: copy("Tümü", "All") },
            { value: "unstaged", label: copy("Stage dışında", "Unstaged") },
            { value: "staged", label: copy("Stage’de", "Staged") },
          ]}
          onChange={setFileFilter} />
      </>,
    },
  );
  if (historyOpen && root)
    return <>{edge}<GitHistoryPanel key={JSON.stringify([machine?.id, projectId, cwd, root])} scope={scope} onClose={() => setHistoryOpen(false)} registerExit={(exit) => { historyExit.current = exit; }} /></>;
  if (stashesOpen && root)
    return <>{edge}<GitStashes key={stashScope} scope={scope} onClose={() => setStashesOpen(false)}
      onBusyChange={(value) => setStashWrite((current) => !value && current?.scope !== stashScope ? current : { scope: stashScope, busy: value })}
      registerExit={(exit) => { stashExit.current = exit; }} /></>;
  if (managementOpen && root)
    return <>{edge}<GitManagement key={stashScope} scope={scope} initialTab={managementTab} onClose={() => setManagementOpen(false)}
      onBusyChange={(value) => setStashWrite((current) => !value && current?.scope !== stashScope ? current : { scope: stashScope, busy: value })}
      registerExit={(exit) => { managementExit.current = exit; }} /></>;
  if (conflictReview && root)
    return <>{edge}<ConflictReview key={`${stashScope}:${conflictReview}`} scope={scope} path={conflictReview} onClose={() => setConflictReview(null)} onChanged={() => { void index.refetch(); }} onBusyChange={(value) => setStashWrite((current) => !value && current?.scope !== stashScope ? current : { scope: stashScope, busy: value })} registerExit={(exit) => { gitReviewExit.current = exit; }} /></>;
  if (!data || data.repository === false) {
    // One feedback owner: QueryState carries its own skeleton and Retry, so no extra Refresh button.
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, paddingLeft: gutter.left, paddingRight: gutter.right, gap: space.sm }}>
          {data?.repository === false ? (
            <StateView
              compact
              title={copy("Bu klasör bir Git deposu değil.", "This folder is not a Git repository.")}
              action={{
                label: copy("Yenile", "Refresh"),
                onPress: () => { void index.refetch(); },
                busy: index.isFetching,
              }}
            />
          ) : (
            <QueryState query={index} loading="list" onManageConnections={manageConnections} />
          )}
        </View>
      </Screen>
    );
  }
  const hasChangedFiles = data.files.some((file) => file.staged || file.unstaged);
  return (
    <>
      {edge}
      <ScreenList<GitListRow>
        grouped
        data={rows}
        keyExtractor={(row) => row.key}
        query={index}
        header={
          <View style={uiStyles.stack}>
            {!selection ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <GitHeader
                    index={data}
                    busy={busy || !draft.ready}
                    linkedPr={prLink.linked}
                    onOpenActions={() => setMenuOpen(true)}
                  />
                </View>
                {hasChangedFiles ? <>{fileSearch.trigger}{fileSearch.filterTrigger}</> : null}
              </View>
            ) : null}
            {fileSearch.sheet}
            {draftStatus}
            {index.error ? <QueryState query={index} loading="none" /> : null}
            {!state.confirmation && !branchPicker ? feedback : null}
            {!selection && !data.operation && !data.conflicts?.length ? (
              <GitCommitBar
                index={data}
                message={message}
                onMessageChange={(value) => patchDraft({ message: value })}
                generation={generation}
                busy={busy || !draft.ready}
                onCommit={(stageAll) => choose({ kind: "commit" }, stageAll)}
                onPush={() => choose({ kind: "push" })}
              />
            ) : null}
            {data.operation && root ? (
              <GitOperationPanel
                operation={data.operation}
                hasConflicts={!!data.conflicts?.length}
                busy={busy}
                onChoose={choose}
              />
            ) : null}
            {data.conflicts?.length ? (
              <GitConflictsPanel
                files={data.conflicts}
                canResolve={!!root}
                busy={busy}
                onOpenFile={onOpenFile}
                onStageFile={(path) => runFileAction("stage", path)}
                onReview={(path) => setConflictReview(path)}
                onChoose={choose}
              />
            ) : null}
            {selection ? (
              <GitDiffPanel
                scope={scope}
                selection={selection}
                busy={busy}
                onBack={showFiles}
                onOpenFile={onOpenFile}
                onStage={(selected) =>
                  runFileAction(selected.staged ? "unstage" : "stage", selected.path)
                }
                onDiscard={(path) => choose({ kind: "discard", path })}
                onReviewBusy={(value) => setStashWrite((current) => !value && current?.scope !== stashScope ? current : { scope: stashScope, busy: value })}
                onReviewExit={(exit) => { gitReviewExit.current = exit; }}
              />
            ) : null}
          </View>
        }
        contentContainerStyle={{ gap: 0 }}
        ListEmptyComponent={
          selection ? undefined : hasChangedFiles && filtered ? (
            <NoResults searching={!!fileQuery.trim()} filtered={fileFilter !== "all"}
              filtersTitle={copy("Filtrelere uyan değişiklik yok", "No changes match the filters")}
              onClearSearch={() => setFileQuery("")} onClearFilters={() => setFileFilter("all")} />
          ) : data.conflicts?.length || data.operation ? undefined : (
            <StateView
              compact
              title={copy("Kaydedilecek değişiklik yok.", "Nothing to commit.")}
            />
          )
        }
        renderItem={({ item, index }) =>
          item.kind === "group" ? (
            <GitChangeGroupHeader
              group={item.staged ? "staged" : "unstaged"}
              count={item.count}
              expanded={!collapsed?.includes(item.staged ? "staged" : "unstaged")}
              onToggle={() => toggleGroup(item.staged ? "staged" : "unstaged")}
              onBulkAction={filtered ? undefined : () => runFileAction(item.staged ? "unstageAll" : "stageAll")}
              busy={busy}
            />
          ) : (
            <GroupedListRow
              first={index === 0 || rows[index - 1]?.kind === "group"}
              last={index === rows.length - 1 || rows[index + 1]?.kind === "group"}
            >
              <GitFileSwipeRow
                file={item.file}
                staged={item.staged}
                busy={busy}
                onPreview={() => {
                  if (!busy)
                    dispatch({
                      type: "view",
                      view: {
                        kind: "diff",
                        selection: { path: item.file.relative, staged: item.staged },
                      },
                    });
                }}
                onStage={() => runFileAction(item.staged ? "unstage" : "stage", item.file.relative)}
                onOptions={() => { if (!busy) setFileOptions({ file: item.file, staged: item.staged }); }}
              />
            </GroupedListRow>
          )
        }
      />
      <GitFileOptionsSheet
        target={fileOptions}
        busy={busy}
        onClose={() => setFileOptions(null)}
        onPreview={(file, staged) => { if (!busy) dispatch({ type: "view", view: { kind: "diff", selection: { path: file.relative, staged } } }); }}
        onStage={(file, staged) => runFileAction(staged ? "unstage" : "stage", file.relative)}
        onOpen={(file) => onOpenFile(file.relative)}
        onDiscard={(file) => choose({ kind: "discard", path: file.relative })}
      />
      <GitActionsSheet
        visible={menuOpen && !state.confirmation}
        index={data}
        busy={busy || !draft.ready}
        canRunWorkspace={!!root}
        linkPr={prLink.supported ? { hasSession: !!prLink.session, linked: prLink.linked } : undefined}
        onClose={() => setMenuOpen(false)}
        handlers={{
          push: () => choose({ kind: "push" }),
          pull: () => choose({ kind: "pull" }),
          fetch: () => { void actions.fetch().catch(() => {}); },
          branches: showBranches,
          history: () => setHistoryOpen(true),
          stashes: () => setStashesOpen(true),
          management: () => { setManagementTab("branches"); setManagementOpen(true); },
          createPr: () => { setManagementTab("pr"); setManagementOpen(true); },
          linkPr: () => setLinkPrOpen(true),
        }}
      />
      {deliveryOpen && data.branch ? (
        <GitDeliverySheet scope={scope} branch={data.branch} onClose={() => setDeliveryOpen(false)} />
      ) : null}
      <GitLinkPullRequestSheet visible={linkPrOpen && !state.confirmation} projectId={projectId} link={prLink} onClose={() => setLinkPrOpen(false)} />
      {branchPicker ? (
        <GitBranchesPanel
          scope={scope}
          name={branchName}
          onNameChange={(value) => patchDraft({ branchName: value })}
          creating={busy || !draft.ready}
          onCreate={createBranch}
          onChoose={choose}
          onClose={showFiles}
        >
          {feedback}
          {draftStatus}
        </GitBranchesPanel>
      ) : null}
      {state.confirmation ? (
        <Sheet
          visible
          size="compact"
          title={copy("Git işlemini onayla", "Confirm Git action")}
          dismissible={!busy}
          onClose={() => dispatch({ type: "confirm", confirmation: null })}
        >
          <GitConfirmationReview
            confirmation={state.confirmation}
            stageAll={stageAllReview.current === state.confirmation}
            busy={busy}
            onCancel={() => dispatch({ type: "confirm", confirmation: null })}
            onConfirm={confirm}
          />
          <ErrorNotice error={confirmationError} />
          {feedback}
        </Sheet>
      ) : null}
    </>
  );
}
