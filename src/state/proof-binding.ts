import type { HostDescriptor, MobileMachine } from "../remote/types";
import { RemoteHostError } from "../remote/host-error";
import { DEVICE_PROOF_CAPABILITY, newProofSeed, proofKeyOf } from "../remote/device-proof";
import { routeKind } from "./route-kind";
import { credentials } from "./machines";

type Request = (method: string, params: Record<string, unknown>, options?: { retry?: boolean }) => Promise<unknown>;

const RETRY_AFTER_MS = 60_000;
const inFlight = new Set<string>();
/** A Host answer that refused the bind stays refused until the app restarts; no retry loop. */
const refused = new Set<string>();
const retryAt = new Map<string, number>();

/**
 * Binds a credential paired before device proofs to a phone key, over a private route only
 * (a public tunnel never carries the bind). The seed is stored before the request and kept on
 * any failure, so an uncertain bind is repeated with the same key on a later connection.
 * Every later request of this computer is then signed by `HostTransport` and the native sockets.
 */
export async function ensureDeviceProofBinding(
  machine: MobileMachine,
  descriptor: HostDescriptor,
  request: Request,
  now = Date.now(),
): Promise<"bound" | "skipped" | "failed"> {
  if (
    !descriptor.capabilities.includes(DEVICE_PROOF_CAPABILITY) ||
    descriptor.credential?.proofBound !== false ||
    descriptor.environmentId !== machine.environmentId
  )
    return "skipped";
  const kind = routeKind(machine);
  if (kind !== "lan" && kind !== "tailscale") return "skipped";
  if (inFlight.has(machine.id) || refused.has(machine.id) || (retryAt.get(machine.id) ?? 0) > now)
    return "skipped";
  inFlight.add(machine.id);
  try {
    let seed = await credentials.getProofSeed(machine.id, machine);
    if (!seed) {
      seed = newProofSeed();
      await credentials.saveProofSeed(machine.id, seed);
    }
    await request("devices.bindProofKey", { proofKey: proofKeyOf(seed) }, { retry: false });
    retryAt.delete(machine.id);
    return "bound";
  } catch (error) {
    if (error instanceof RemoteHostError && !["network", "timeout", "aborted"].includes(error.kind))
      refused.add(machine.id);
    else retryAt.set(machine.id, now + RETRY_AFTER_MS);
    return "failed";
  } finally {
    inFlight.delete(machine.id);
  }
}

/** Test seam: forget attempt bookkeeping. */
export function resetProofBindingForTests() {
  inFlight.clear();
  refused.clear();
  retryAt.clear();
}
