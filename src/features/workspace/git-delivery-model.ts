import { z } from "zod";
import { hostLifetimeDeadline } from "../../../../src/shared/lib/time/hostLifetime";
import { monotonicNow } from "../../../../src/shared/lib/time/timestamps";
import { IdentifierSchema, SafeCounterSchema } from "../../../../src/shared/model/host-contracts/schemas";
import { TaskDeliveryArtifactsSchema } from "../../../../src/shared/model/host-contracts/tasks";

/** The slice of a Host managed workspace the phone needs to start a delivery review. */
export type DeliveryWorkspace = {
  id: string;
  owner?: { kind: string; id: string };
  branchRef: string;
  targetBranchRef: string;
  revision: number;
  state: string;
};

const reviewText = z.string().refine(value => value.trim().length > 0);
const gitHead = z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i);
const blockers = z.array(reviewText);
const artifactPreview = TaskDeliveryArtifactsSchema.omit({
  planToken: true,
  sourceHead: true,
  targetDirectory: true,
}).extend({ blockers });

/** Display fields only. Larger Host extensions such as the full diff are not retained. */
const mergePlan = z.object({
  action: z.literal("merge"),
  token: reviewText,
  expiresAt: SafeCounterSchema,
  expiresInMs: SafeCounterSchema,
  workspaceId: IdentifierSchema,
  expectedRevision: SafeCounterSchema,
  sourceBranchRef: reviewText,
  sourceHead: gitHead,
  sourceStatusFingerprint: reviewText.optional(),
  targetBranchRef: reviewText,
  targetHead: gitHead,
  targetDirectory: reviewText.optional(),
  targetStatusFingerprint: reviewText,
  commits: z.array(z.string()),
  changedPaths: z.array(z.string().min(1)),
  overlappingPaths: z.array(z.string().min(1)),
  committedConflict: z.object({ sourceHead: gitHead, targetHead: gitHead }).optional(),
  checks: z.array(z.object({ name: reviewText, status: z.enum(["passed", "failed", "unknown"]) })),
  visualEvidence: z.array(z.string()),
  blockers,
  artifacts: artifactPreview.optional(),
});

export type TaskDeliveryPlan = z.infer<typeof mergePlan> & { deadline: number };
export type DeliveryPlan = TaskDeliveryPlan;

export function parseTaskDeliveryPlan(
  raw: unknown,
  workspaceId: string,
  expectedRevision: number,
  sentAt = monotonicNow(),
): TaskDeliveryPlan {
  const result = mergePlan.safeParse(raw);
  if (!result.success || !Number.isFinite(sentAt) || sentAt < 0)
    throw new Error("The computer returned an invalid merge review.");
  const plan = result.data;
  if (plan.workspaceId !== workspaceId || plan.expectedRevision !== expectedRevision)
    throw new Error("The merge review does not match this workspace revision.");
  return { ...plan, deadline: hostLifetimeDeadline(plan.expiresInMs, sentAt) };
}

/** The Host binds the opaque token to all reviewed fields. */
export function taskDeliveryMergeParams(plan: TaskDeliveryPlan, idempotencyKey: string) {
  return {
    workspaceId: plan.workspaceId,
    expectedRevision: plan.expectedRevision,
    idempotencyKey,
    planToken: plan.token,
  };
}

const shortRef = (ref: string) => ref.replace(/^refs\/heads\//, "");

/** The workspace that owns the checked-out managed branch, if the Host lists one. */
export function workspaceForBranch(
  workspaces: readonly DeliveryWorkspace[] | undefined,
  branch: string | null | undefined,
): DeliveryWorkspace | undefined {
  if (!branch) return undefined;
  return workspaces?.find((item) => shortRef(item.branchRef) === shortRef(branch));
}

/** A plan can be merged only while fresh, unblocked, conflict-free and without failed checks. */
export function planMergeBlocker(
  plan: DeliveryPlan,
  now: number,
): "expired" | "blocked" | "conflict" | "checks" | null {
  if (plan.deadline <= now) return "expired";
  if (plan.blockers.length || plan.artifacts?.blockers.length) return "blocked";
  if (plan.committedConflict || plan.overlappingPaths.length) return "conflict";
  if (plan.checks.some((check) => check.status === "failed")) return "checks";
  return null;
}

export const shortBranch = shortRef;
