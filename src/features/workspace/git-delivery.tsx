import { useEffect, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { useConnectionScope } from "@/state/connection-scope";
import { useActiveMachine } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { RemoteHostError } from "@/remote/host-error";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { Body, Disclosure, ErrorNotice, FormActions, MutationState, Notice, QueryState, Sheet, Button } from "@/ui/primitives";
import type { GitScope } from "./git-types";
import { useProjectRefresh } from "./shared";
import {
  planMergeBlocker,
  parseTaskDeliveryPlan,
  shortBranch,
  taskDeliveryMergeParams,
  workspaceForBranch,
  type DeliveryPlan,
  type DeliveryWorkspace,
} from "./git-delivery-model";

/** Managed branches refuse push/merge from Git; delivery goes through a reviewed plan instead. */
export function GitDeliverySheet({
  scope,
  branch,
  task,
  onClose,
}: {
  scope: GitScope;
  branch: string;
  task?: { id: string; workspaceId?: string; title: string };
  onClose: () => void;
}) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const connection = useConnectionScope();
  const [opening] = useState(connection);
  const machine = useActiveMachine();
  const [computerName] = useState(machine?.name || machine?.id);
  const scoped = opening.isCurrent();
  const workspaces = useHostQuery<DeliveryWorkspace[]>(
    ["workspaces", scope.projectId],
    "workspaces.list",
    { projectId: scope.projectId },
    { enabled: scoped },
  );
  const findWorkspace = (items: DeliveryWorkspace[] | undefined) => workspaceForBranch(
    task ? items?.filter((item) => item.owner?.kind === "task" && item.owner.id === task.id &&
      (!task.workspaceId || item.id === task.workspaceId)) : items, branch,
  );
  const workspace = findWorkspace(workspaces.data);
  const review = useHostMutation<unknown>("workspaces.delivery.review", null);
  const merge = useHostMutation<unknown>("workspaces.delivery.merge", []);
  const [plan, setPlan] = useState<DeliveryPlan | null>(null);
  const [merged, setMerged] = useState(false);
  const [readError, setReadError] = useState<unknown>();
  const [uncertainKey, setUncertainKey] = useState<string>();
  const [now, setNow] = useState(() => performance.now());
  const inFlight = useRef(false);
  const refreshProject = useProjectRefresh(scope.projectId);
  const busy = review.isPending || merge.isPending;
  const blocker = plan ? planMergeBlocker(plan, now) : null;
  const current = () => opening.isCurrent();
  // Expire the visible approval at the local monotonic deadline.
  useEffect(() => {
    if (!plan?.deadline) return;
    const timeout = setTimeout(() => setNow(performance.now()), Math.max(0, plan.deadline - performance.now()) + 1);
    return () => clearTimeout(timeout);
  }, [plan]);
  const blockerText = {
    expired: copy("İnceleme süresi doldu. Yeniden incele.", "The review expired. Review again."),
    blocked: copy("Teslim engellendi.", "Delivery is blocked."),
    conflict: copy("Hedef dalla çakışma var.", "The target branch has a conflict."),
    checks: copy("Başarısız kontroller var.", "Some checks failed."),
  } as const;
  const startReview = async () => {
    if ((!workspace && !uncertainKey) || workspaces.isFetching || busy || inFlight.current || !current()) return;
    inFlight.current = true;
    setMerged(false);
    setReadError(undefined);
    if (!uncertainKey) {
      setPlan(null);
      merge.reset();
    }
    try {
      // Check the saved workspace before requesting a fresh plan after a lost reply.
      const refreshed = uncertainKey ? await workspaces.refetch() : undefined;
      if (!current()) return;
      if (refreshed?.isError) throw refreshed.error;
      const source = refreshed ? findWorkspace(refreshed.data) : workspace;
      if (!source || source.id !== (uncertainKey ? plan?.workspaceId : workspace?.id))
        throw new Error(copy("İncelenen içerik değişti. Yenileyip tekrar inceleyin.", "Reviewed contents changed. Refresh and review again."));
      if (uncertainKey && plan && source.state === "merged" && source.deliveredCommit &&
        source.revision > plan.expectedRevision && shortBranch(source.targetBranchRef) === shortBranch(plan.targetBranchRef)) {
        setUncertainKey(undefined);
        merge.reset();
        setPlan(null);
        setMerged(true);
        void refreshProject();
        return;
      }
      const sentAt = performance.now();
      const payload = await review.mutateAsync({ workspaceId: source.id, expectedRevision: source.revision, action: "merge" });
      if (!current()) return;
      const next = parseTaskDeliveryPlan(payload, source.id, source.revision, sentAt);
      if (shortBranch(next.sourceBranchRef) !== shortBranch(branch))
        throw new Error(copy("İncelenen içerik değişti. Yenileyip tekrar inceleyin.", "Reviewed contents changed. Refresh and review again."));
      setNow(performance.now());
      setUncertainKey(undefined);
      merge.reset();
      setPlan(next);
    } catch (error) {
      if (current()) setReadError(error);
    } finally {
      inFlight.current = false;
    }
  };
  const confirmMerge = async () => {
    if (!plan || busy || inFlight.current || !current()) return;
    if (!uncertainKey && (!workspace || workspace.id !== plan.workspaceId || workspace.revision !== plan.expectedRevision ||
      planMergeBlocker(plan, performance.now()))) return;
    inFlight.current = true;
    const key = uncertainKey ?? randomUUID();
    try {
      await merge.mutateAsync(taskDeliveryMergeParams(plan, key));
      if (!current()) return;
      setUncertainKey(undefined);
      setPlan(null);
      setMerged(true);
      void refreshProject();
    } catch (error) {
      if (!current()) return;
      if (error instanceof RemoteHostError && error.uncertain) setUncertainKey(key);
      else {
        setUncertainKey(undefined);
        setPlan(null);
        void workspaces.refetch();
      }
    } finally {
      inFlight.current = false;
    }
  };
  return (
    <Sheet
      visible
      size="form"
      title={copy("Teslim incelemesi", "Delivery review")}
      dismissible={!busy}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {task ? <Body>{[task.title, computerName].filter(Boolean).join(" · ")}</Body> : <Body>
        {copy(
          "Yönetilen dallar doğrudan push veya merge edilemez. Önce incele, sonra onayla.",
          "Managed branches cannot be pushed or merged directly. Review first, then confirm.",
        )}
      </Body>}
      {!plan ? <Body mono selectable style={uiStyles.caption}>
        {shortBranch(branch)}
        {workspace ? ` → ${shortBranch(workspace.targetBranchRef)}` : ""}
      </Body> : null}
      {merged ? <>
        <Notice tone="success" message={copy("Teslim edildi.", "Delivered.")} />
        <Button label={copy("Tamam", "Done")} tone="primary" fullWidth reserveTouchTarget onPress={onClose} />
      </>
        : !scoped ? <Body>{copy("İncelenen içerik değişti. Yenileyip tekrar inceleyin.", "Reviewed contents changed. Refresh and review again.")}</Body> : <>
      <QueryState
        query={workspaces}
        empty={!!workspaces.data && !workspace}
        emptyTitle={copy(
          "Bu dalın yönetilen çalışma alanı bulunamadı.",
          "No managed workspace was found for this branch.",
        )}
      />
      {workspace && !plan ? (
        <Button
          label={readError || merge.error ? copy("Yeniden incele", "Review again") : copy("Teslimi incele", "Review delivery")}
          tone="primary"
          fullWidth
          reserveTouchTarget
          busy={review.isPending}
          disabled={busy || workspaces.isFetching}
          onPress={() => { void startReview(); }}
        />
      ) : null}
      <ErrorNotice error={readError} />
      {plan ? (
        <>
          <Body>{uncertainKey ? copy(
            "İşlem uygulanmış olabilir. Yeniden denemeden önce sonucu kontrol et.",
            "The action may have been applied. Check the result before trying again.",
          ) : copy(
            "{p0} commit, {p1} dosya {p2} dalına birleştirilecek.",
            "{p0} commits and {p1} files will be merged into {p2}.",
            { p0: plan.commits.length, p1: plan.changedPaths.length, p2: shortBranch(plan.targetBranchRef) },
          )}</Body>
          <Body mono selectable style={uiStyles.caption}>{shortBranch(plan.sourceBranchRef)} · {plan.sourceHead.slice(0, 12)}</Body>
          <Body mono selectable style={uiStyles.caption}>{shortBranch(plan.targetBranchRef)} · {plan.targetHead.slice(0, 12)}</Body>
          {plan.changedPaths.length ? <Disclosure label={copy("Değişen dosyalar", "Changed files")}>
            <Body mono selectable>{plan.changedPaths.join("\n")}</Body>
          </Disclosure> : null}
          {plan.artifacts?.paths.length ? <Disclosure label={copy("Görseller ({p0})", "Artifacts ({p0})", { p0: plan.artifacts.paths.length })}>
            <Body mono selectable>{plan.artifacts.paths.join("\n")}</Body>
          </Disclosure> : null}
          {plan.overlappingPaths.length ? (
            <Body muted style={uiStyles.caption}>
              {copy(
                "{p0} dosya hedef dalda da değişmiş.",
                "{p0} files also changed in the target.",
                { p0: plan.overlappingPaths.length },
              )}
            </Body>
          ) : null}
          {[...new Set([...plan.blockers, ...(plan.artifacts?.blockers ?? [])])].map((text) => (
            <Body key={text} muted style={uiStyles.caption}>
              {text}
            </Body>
          ))}
          {blocker && !uncertainKey ? <Body style={uiStyles.caption}>{blockerText[blocker]}</Body> : null}
          {/* The reviewed delivery confirms from the sheet's shared action area. */}
          <FormActions
            submitLabel={uncertainKey ? copy("Durumu kontrol et", "Check status")
              : task ? copy("Teslimatı onayla", "Approve delivery") : copy("Birleştir", "Merge")}
            onSubmit={() => { void (uncertainKey ? startReview() : confirmMerge()); }}
            cancelLabel={uncertainKey ? copy("Yeniden dene", "Retry") : copy("Yeniden incele", "Review again")}
            onCancel={() => { void (uncertainKey ? confirmMerge() : startReview()); }}
            busy={busy || workspaces.isFetching}
            disabled={!uncertainKey && (!!blocker || workspace?.id !== plan.workspaceId || workspace.revision !== plan.expectedRevision)}
          />
        </>
      ) : null}
      {!uncertainKey ? <MutationState mutation={merge} /> : null}
      </>}
    </Sheet>
  );
}
