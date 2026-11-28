import {
  APPROVAL_OCCURRENCE_CAPABILITY,
  isApprovalOccurrenceId,
} from "../../../src/shared/model/approvalOccurrence";
import { SESSION_APPROVAL_GRANTS_CAPABILITY } from "../../../src/shared/model/sessionApprovalGrant";

export class ApprovalCommandRefused extends Error {
  readonly kind = "host";
  readonly uncertain = false;
  constructor(readonly reason: "unsupported" | "unidentified" | "sessionGrant") {
    super(
      reason === "unsupported"
        ? "This Host cannot verify which request you are answering. Update the Host before responding."
        : reason === "sessionGrant"
          ? "This request cannot be allowed for the whole session. Allow it once instead."
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
  allowForSession?: true,
) {
  return Object.freeze({
    type: "approve" as const,
    sessionId,
    runId,
    requestId: approval.requestId,
    approvalOccurrenceId: approval.occurrenceId,
    decision,
    ...(allowForSession && decision === "allow" ? { allowForSession } : {}),
  });
}

/**
 * Desktop's `supportsSessionGrant`: "Allow for this session" exists only for a request the Host
 * scoped as session-grantable (today Claude's workspace filename search), with a verifiable
 * occurrence, on a Host that advertises session approval grants.
 */
export function canAllowForSession(
  capabilities: readonly string[] | undefined,
  approval: { occurrenceId?: string; sessionApprovalScope?: string; decided?: string },
): boolean {
  return (
    !approval.decided &&
    !!approval.sessionApprovalScope &&
    isApprovalOccurrenceId(approval.occurrenceId) &&
    !!capabilities?.includes(APPROVAL_OCCURRENCE_CAPABILITY) &&
    !!capabilities.includes(SESSION_APPROVAL_GRANTS_CAPABILITY)
  );
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
  if (
    params.allowForSession !== undefined &&
    (params.allowForSession !== true ||
      params.decision !== "allow" ||
      !capabilities.includes(SESSION_APPROVAL_GRANTS_CAPABILITY))
  )
    throw new ApprovalCommandRefused("sessionGrant");
}
