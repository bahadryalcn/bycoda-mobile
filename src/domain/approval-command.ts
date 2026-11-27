import {
  APPROVAL_OCCURRENCE_CAPABILITY,
  isApprovalOccurrenceId,
} from "../../../src/shared/model/approvalOccurrence";

export class ApprovalCommandRefused extends Error {
  readonly kind = "host";
  readonly uncertain = false;
  constructor(readonly reason: "unsupported" | "unidentified") {
    super(
      reason === "unsupported"
        ? "This Host cannot verify which request you are answering. Update the Host before responding."
        : "This request cannot be verified. Refresh the session or update its execution client.",
    );
    this.name = "ApprovalCommandRefused";
  }
}

/** Capture the displayed primitive tuple before any asynchronous dispatch. */
export function captureApprovalCommand(
  sessionId: string,
  runId: string,
  approval: { requestId: number; occurrenceId?: string },
  decision: "allow" | "deny",
) {
  return Object.freeze({
    type: "approve" as const,
    sessionId,
    runId,
    requestId: approval.requestId,
    approvalOccurrenceId: approval.occurrenceId,
    decision,
  });
}

/** Client preflight is not permission; the Host independently checks its source. */
export function assertApprovalCommand(
  capabilities: readonly string[] | undefined,
  params: Record<string, unknown>,
) {
  if (params.type !== "approve") return;
  if (!capabilities?.includes(APPROVAL_OCCURRENCE_CAPABILITY))
    throw new ApprovalCommandRefused("unsupported");
  if (!isApprovalOccurrenceId(params.approvalOccurrenceId))
    throw new ApprovalCommandRefused("unidentified");
}
