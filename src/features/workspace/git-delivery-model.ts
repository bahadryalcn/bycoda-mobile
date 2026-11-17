/** The slice of a Host managed workspace the phone needs to start a delivery review. */
export type DeliveryWorkspace = {
  id: string;
  branchRef: string;
  targetBranchRef: string;
  revision: number;
  state: string;
};

/** The Host merge plan returned by `workspaces.delivery.review`. */
export type DeliveryPlan = {
  token: string;
  expiresAt: number;
  workspaceId: string;
  expectedRevision: number;
  sourceBranchRef: string;
  targetBranchRef: string;
  commits: string[];
  changedPaths: string[];
  overlappingPaths: string[];
  committedConflict?: unknown;
  checks: { name: string; status: "passed" | "failed" | "unknown" }[];
  blockers: string[];
};

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
  if (plan.expiresAt <= now) return "expired";
  if (plan.blockers.length) return "blocked";
  if (plan.committedConflict) return "conflict";
  if (plan.checks.some((check) => check.status === "failed")) return "checks";
  return null;
}

export const shortBranch = shortRef;
