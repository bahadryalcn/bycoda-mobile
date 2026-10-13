import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { BackHandler, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import {
  Body,
  Badge,
  Button,
  Empty,
  ErrorNotice,
  QueryState,
  Row,
  Screen,
  ScreenList,
  Sheet,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useActiveMachine } from "@/state/machines";
import { useGitActions } from "./git-actions";
import { GitBranchesPanel } from "./git-branches";
import { GitCommitPanel } from "./git-changes";
import { GitConfirmationCard } from "./git-confirmation";
import { GitDiffPanel } from "./git-diff";
import { GitFileRow } from "./git-file-row";
import { useGitIndex } from "./git-queries";
import {
  GitActionFeedback,
  GitConflictsPanel,
  GitHeader,
  GitOperationPanel,
  GitSummary,
} from "./git-status";
import { workspaceStyles } from "./shared";
import { gitReducer, initialGitState, type GitConfirmation } from "./workspace-state";
import type { GitFileAction, GitScope, ProjectGitProps } from "./git-types";
import type { GitChangedFile } from "./wire";
import { registerWorkspaceDraft } from "./draft-guard";
import { useLocalDraft } from "./use-local-draft";
import { colors, space } from "@/ui/tokens";
import { uiStyles } from "@/ui/styles";
import GitCommitHorizontal from "lucide-react-native/icons/git-commit-horizontal";
import FileDiff from "lucide-react-native/icons/file-diff";

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
type GitRow =
  | { kind: "group"; key: string; staged: boolean; count: number }
  | { kind: "file"; key: string; staged: boolean; file: GitChangedFile };

export function ProjectGit({ projectId, cwd, root, onOpenFile, onDraftGuard }: ProjectGitProps) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const navigation = useNavigation();
  const scope = useMemo<GitScope>(() => ({ projectId, cwd, root }), [projectId, cwd, root]);
  const index = useGitIndex(scope);
  const actions = useGitActions(scope);
  const [state, dispatch] = useReducer(gitReducer, initialGitState);
  const [confirmationError, setConfirmationError] = useState<Error | null>(null);
  const draftKey = "bycoda.mobile.git-draft.v1:" + JSON.stringify([machine?.id, projectId, cwd]);
  const draft = useLocalDraft<GitDraft>(draftKey, decodeDraft, encodeDraft);
  const { message = "", branchName = "" } = draft.value ?? {};
  const hasDraft = !!(message || branchName);
  const busy = actions.busy;
  const data = index.data;
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
  usePreventRemove(busy || hasDraft || !!selection, ({ data: event }) => {
    if (busy) return;
    if (selection) {
      showFiles();
      return;
    }
    void persist()
      .then(() => navigation.dispatch(event.action))
      .catch(() => {});
  });
  useFocusEffect(
    useCallback(() => {
      if (!selection || state.confirmation) return;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (!busy) showFiles();
        return true;
      });
      return () => subscription.remove();
    }, [selection, state.confirmation, busy, showFiles]),
  );
  const patchDraft = (patch: Partial<GitDraft>) =>
    draft.setValue((current) => ({ message: "", branchName: "", ...current, ...patch }));
  const choose = (confirmation: GitConfirmation) => {
    if (busy || !draft.ready) return;
    setConfirmationError(null);
    dispatch({
      type: "confirm",
      confirmation: {
        ...confirmation,
        context: {
          machine: machine?.name ?? "",
          root: root ?? cwd ?? "",
          branch: data?.branch ?? null,
          message,
          files: (data?.files ?? [])
            .filter((file) => file.staged)
            .map((file) => file.relative)
            .sort(),
        },
      },
    });
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
      .then(() =>
        draft.setValue((current) => ({
          message: current?.message ?? "",
          branchName: current?.branchName === submitted ? "" : (current?.branchName ?? ""),
        })),
      )
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
            JSON.stringify(
              (data?.files ?? [])
                .filter((file) => file.staged)
                .map((file) => file.relative)
                .sort(),
            )))
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
      .executeConfirmation(confirmation, context?.message ?? message)
      .then(() => {
        dispatch({ type: "completed", confirmation });
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
        error={draft.error}
        message={
          !draft.ready
            ? copy("Kaydedilmiş Git taslağı okunamadı.", "Saved Git draft could not be read.")
            : undefined
        }
        onRetry={() => {
          void (draft.ready ? persist() : draft.load()).catch(() => {});
        }}
      />
      {!draft.ready && !draft.error ? (
        <QueryState query={{ isPending: true }} loading="inline" />
      ) : null}
    </>
  );
  const rows: GitRow[] = !selection
    ? (["unstaged", "staged"] as const).flatMap((group) => {
        const files = (data?.files ?? []).filter((file) => file[group]);
        return files.length
          ? [
              {
                kind: "group" as const,
                key: group,
                staged: group === "staged",
                count: files.length,
              },
              ...files.map((file) => ({
                kind: "file" as const,
                key: group + ":" + file.relative,
                staged: group === "staged",
                file,
              })),
            ]
          : [];
      })
    : [];
  if (!data || data.repository === false)
    return (
      <Screen>
        <QueryState query={index} />
        {data?.repository === false ? (
          <Empty
            title={copy("Bu klasör bir Git deposu değil.", "This folder is not a Git repository.")}
          />
        ) : null}
        {draftStatus}
        <Button
          label={copy("Yenile", "Refresh")}
          onPress={() => {
            void index.refetch();
          }}
          busy={index.isFetching}
        />
      </Screen>
    );
  return (
    <>
      <ScreenList<GitRow>
        data={rows}
        keyExtractor={(row) => row.key}
        query={index}
        header={
          <View style={workspaceStyles.stack}>
            <GitHeader
              index={data}
              busy={busy}
              refreshing={index.isFetching}
              onRefresh={() => {
                void index.refetch();
              }}
              onToggleBranches={() => dispatch({ type: "view", view: { kind: "branches" } })}
            />
            <QueryState query={index} />
            {draftStatus}
            {!state.confirmation && !branchPicker ? feedback : null}
            <GitSummary index={data} />
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
              />
            ) : !rows.length && !data.conflicts?.length ? (
              <Empty
                title={copy("Çalışma klasörü temiz", "Working folder is clean")}
                detail={copy("Kaydedilecek dosya değişikliği yok.", "No file changes to record.")}
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) =>
          item.kind === "group" ? (
            <Row style={{ paddingTop: space.md, paddingBottom: space.xs, flexWrap: "nowrap" }}>
              {item.staged ? (
                <GitCommitHorizontal size={18} color={colors.success} />
              ) : (
                <FileDiff size={18} color={colors.muted} />
              )}
              <Body style={[uiStyles.grow, uiStyles.label]}>
                {item.staged
                  ? copy("Stage’de", "Staged")
                  : copy("Değişen dosyalar", "Changed files")}
              </Body>
              <Badge label={String(item.count)} tone={item.staged ? "success" : "default"} />
              <Button
                tone="quiet"
                density="compact"
                label={
                  item.staged
                    ? copy("Tümünü çıkar", "Unstage all")
                    : copy("Tümünü stage’e al", "Stage all")
                }
                disabled={busy}
                onPress={() => runFileAction(item.staged ? "unstageAll" : "stageAll")}
              />
            </Row>
          ) : (
            <GitFileRow
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
            />
          )
        }
        footer={
          !selection ? (
            <GitCommitPanel
              index={data}
              canRunWorkspace={!!root}
              message={message}
              onMessageChange={(value) => patchDraft({ message: value })}
              busy={busy || !draft.ready}
              fetching={actions.extended.isPending}
              onFetch={() => {
                void actions.fetch().catch(() => {});
              }}
              onChoose={choose}
            />
          ) : null
        }
      />
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
          <GitConfirmationCard
            confirmation={state.confirmation}
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
