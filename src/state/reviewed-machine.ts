import type { MobileMachine } from "@/remote/types";

export type ReviewedMachine = Pick<MobileMachine, "id" | "endpoint" | "environmentId" | "lanKey">;

/** A credential or route change only suspends its own computer unless it is account-wide. */
export function isMachinePending(
  state: { accountPending?: boolean; pendingMachineIds?: readonly string[] },
  id: string | null | undefined,
): boolean {
  return !!(state.accountPending || (id != null && state.pendingMachineIds?.includes(id)));
}

export function reviewedMachine(
  machine: MobileMachine | null | undefined,
): ReviewedMachine | undefined {
  return machine
    ? {
        id: machine.id,
        endpoint: machine.endpoint,
        environmentId: machine.environmentId,
        lanKey: machine.lanKey,
      }
    : undefined;
}

/** A reviewed write cannot follow a re-paired connection merely because its saved ID survived. */
export function isReviewedMachine(
  review: ReviewedMachine | undefined,
  state: { activeId: string | null; machines: readonly MobileMachine[] },
): boolean {
  if (!review || state.activeId !== review.id) return false;
  const current = state.machines.find((value) => value.id === review.id);
  return (
    !!current &&
    current.endpoint === review.endpoint &&
    current.environmentId === review.environmentId &&
    current.lanKey === review.lanKey
  );
}

/** A persisted receipt stores only this digest, never endpoint or transport key material. */
export async function reviewedMachineIdentityDigest(
  review: ReviewedMachine | undefined,
  hash: (value: string) => Promise<string>,
): Promise<string> {
  if (!review) throw new Error("Reviewed machine is unavailable");
  const digest = await hash(
    JSON.stringify([
      "bycoda:reviewed-machine:v1",
      review.id,
      review.environmentId,
      review.endpoint,
      review.lanKey,
    ]),
  );
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid reviewed machine digest");
  return digest;
}
