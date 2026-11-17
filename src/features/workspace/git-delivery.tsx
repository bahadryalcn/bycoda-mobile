import { useState } from "react";
import { randomUUID } from "expo-crypto";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { Body, ConfirmationCard, ErrorNotice, MutationState, QueryState, Sheet, Button } from "@/ui/primitives";
import type { GitScope } from "./git-types";
import {
  planMergeBlocker,
  shortBranch,
  workspaceForBranch,
  type DeliveryPlan,
  type DeliveryWorkspace,
} from "./git-delivery-model";

/** Managed branches refuse push/merge from Git; delivery goes through a reviewed plan instead. */
export function GitDeliverySheet({
  scope,
  branch,
  onClose,
}: {
  scope: GitScope;
  branch: string;
  onClose: () => void;
}) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const workspaces = useHostQuery<DeliveryWorkspace[]>(
    ["workspaces", scope.projectId],
    "workspaces.list",
    { projectId: scope.projectId },
  );
  const workspace = workspaceForBranch(workspaces.data, branch);
  const review = useHostMutation<DeliveryPlan>("workspaces.delivery.review", null);
  const merge = useHostMutation<unknown>("workspaces.delivery.merge", [
    ["git", scope.projectId],
    ["workspaces", scope.projectId],
  ]);
  const [plan, setPlan] = useState<DeliveryPlan | null>(null);
  const [merged, setMerged] = useState(false);
  const busy = review.isPending || merge.isPending;
  const blocker = plan ? planMergeBlocker(plan, Date.now()) : null;
  const blockerText = {
    expired: copy("İnceleme süresi doldu. Yeniden incele.", "The review expired. Review again."),
    blocked: copy("Teslim engellendi.", "Delivery is blocked."),
    conflict: copy("Hedef dalla çakışma var.", "The target branch has a conflict."),
    checks: copy("Başarısız kontroller var.", "Some checks failed."),
  } as const;
  const startReview = () => {
    if (!workspace || busy) return;
    setMerged(false);
    void review
      .mutateAsync({
        workspaceId: workspace.id,
        expectedRevision: workspace.revision,
        action: "merge",
      })
      .then(setPlan)
      .catch(() => {});
  };
  const confirmMerge = () => {
    if (!plan || busy || planMergeBlocker(plan, Date.now())) return;
    void merge
      .mutateAsync({
        workspaceId: plan.workspaceId,
        expectedRevision: plan.expectedRevision,
        idempotencyKey: randomUUID(),
        planToken: plan.token,
      })
      .then(() => {
        setPlan(null);
        setMerged(true);
      })
      .catch(() => {});
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
      <Body>
        {copy(
          "Yönetilen dallar doğrudan push veya merge edilemez. Önce incele, sonra onayla.",
          "Managed branches cannot be pushed or merged directly. Review first, then confirm.",
        )}
      </Body>
      <Body mono selectable style={uiStyles.caption}>
        {shortBranch(branch)}
        {workspace ? ` → ${shortBranch(workspace.targetBranchRef)}` : ""}
      </Body>
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
          label={copy("Teslimi incele", "Review delivery")}
          tone="primary"
          busy={review.isPending}
          disabled={busy}
          onPress={startReview}
        />
      ) : null}
      <ErrorNotice error={review.error} />
      {plan ? (
        <ConfirmationCard
          tone="default"
          message={copy(
            "{p0} commit, {p1} dosya {p2} dalına birleştirilecek.",
            "{p0} commits and {p1} files will be merged into {p2}.",
            { p0: plan.commits.length, p1: plan.changedPaths.length, p2: shortBranch(plan.targetBranchRef) },
          )}
          cancelLabel={copy("Yeniden incele", "Review again")}
          onCancel={startReview}
          confirmLabel={copy("Birleştir", "Merge")}
          onConfirm={confirmMerge}
          busy={merge.isPending}
          disabled={!!blocker}
        >
          {plan.overlappingPaths.length ? (
            <Body muted style={uiStyles.caption}>
              {copy(
                "{p0} dosya hedef dalda da değişmiş.",
                "{p0} files also changed in the target.",
                { p0: plan.overlappingPaths.length },
              )}
            </Body>
          ) : null}
          {plan.blockers.map((text) => (
            <Body key={text} muted style={uiStyles.caption}>
              {text}
            </Body>
          ))}
          {blocker ? <Body style={uiStyles.caption}>{blockerText[blocker]}</Body> : null}
        </ConfirmationCard>
      ) : null}
      <MutationState
        mutation={merge}
        success={merged ? copy("Teslim edildi.", "Delivered.") : undefined}
      />
    </Sheet>
  );
}
