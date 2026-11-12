import { RemoteHostError } from "@/remote/host-error";
import { parseApprovals, type ApprovalView } from "./approvals-model";

export type ApprovalsPort = {
  request(
    method: string,
    params: Record<string, unknown>,
    options: { retry: false; signal?: AbortSignal },
  ): Promise<unknown>;
};

export type ApprovalDecision = {
  id: string;
  status: ApprovalView["status"];
  approved: boolean;
  alreadyDecided: boolean;
};

/**
 * `rejected`: the Host refused (expired, not remote, signature changed); nothing was recorded.
 * `uncertain`: the answer may have reached the Host; the owner checks the status, nothing is resent.
 */
export class ApprovalDecisionError extends Error {
  constructor(readonly code: "rejected" | "uncertain") {
    super(code === "rejected" ? "The computer refused this decision." : "The result is unknown.");
    this.name = "ApprovalDecisionError";
  }
}

export class ApprovalsClient {
  constructor(private readonly port: ApprovalsPort) {}

  async list(signal?: AbortSignal): Promise<ApprovalView[]> {
    return parseApprovals(await this.port.request("approvals.list", {}, { retry: false, signal }));
  }

  /** One request per call, never retried: the Host keeps the first decision, the phone never re-mints it. */
  async decide(approval: ApprovalView, approved: boolean): Promise<ApprovalDecision> {
    let raw: unknown;
    try {
      raw = await this.port.request(
        "approvals.decide",
        { id: approval.id, signature: approval.signature, approved },
        { retry: false },
      );
    } catch (error) {
      const refused = error instanceof RemoteHostError && !error.uncertain;
      throw new ApprovalDecisionError(refused ? "rejected" : "uncertain");
    }
    const value = raw as Partial<ApprovalDecision> | null;
    if (
      !value ||
      value.id !== approval.id ||
      typeof value.approved !== "boolean" ||
      typeof value.alreadyDecided !== "boolean" ||
      !["pending", "approved", "denied", "expired"].includes(String(value.status))
    )
      throw new ApprovalDecisionError("uncertain");
    return value as ApprovalDecision;
  }
}
