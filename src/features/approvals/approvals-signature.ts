import * as Crypto from "expo-crypto";
import type { ApprovalView } from "./approvals-model";

/**
 * Mirror of `ownerApprovalSignature` in the desktop shared model (the phone cannot import its
 * runtime). The phone only offers a decision when the Host's signature matches what it displays.
 */
export async function approvalSignature(approval: ApprovalView): Promise<string> {
  const canonical = JSON.stringify([
    approval.id,
    approval.title,
    approval.message,
    approval.confirmLabel,
    approval.cancelLabel,
    approval.deadline,
    approval.remote,
    approval.details ?? null,
  ]);
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonical);
}

export async function approvalSignatureMatches(approval: ApprovalView): Promise<boolean> {
  try {
    return (await approvalSignature(approval)) === approval.signature;
  } catch {
    return false;
  }
}
