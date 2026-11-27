import type { HostDescriptor, MobileMachine, RemoteRequestOptions } from "./types";
import { HostTransport } from "./host-transport";

export async function discoverMachine(
  endpoint: string,
  credential: string,
  options: RemoteRequestOptions & {
    fetchImpl?: typeof fetch;
    lanKey?: string;
    environmentId?: string;
    /** The key this credential is bound to; signs the request when the Host already knows it. */
    proofSeed?: Uint8Array;
  } = {},
): Promise<HostDescriptor> {
  // Pairing uses a transient owner-entered key rather than the saved-key reader.
  // Apply the same native access gate without importing native modules for pure endpoint utilities.
  const { assertAppAccess } = await import("../state/security");
  const machine: MobileMachine = {
    id: "pairing",
    name: "",
    endpoint,
    environmentId: options.environmentId ?? "",
    lanKey: options.lanKey,
  };
  return new HostTransport(
    machine,
    async () => credential,
    options.fetchImpl,
    assertAppAccess,
    options.proofSeed ? async () => options.proofSeed! : undefined,
    // Discovery runs before the credential is saved: it must not retire the phone's earlier
    // credential, which is all the phone has left if the save then fails.
    true,
  ).describe(options);
}
