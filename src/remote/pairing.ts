import type { HostDescriptor, MobileMachine, RemoteRequestOptions } from "./types";
import { HostTransport } from "./host-transport";

export async function discoverMachine(
  endpoint: string,
  credential: string,
  options: RemoteRequestOptions & {
    fetchImpl?: typeof fetch;
    lanKey?: string;
    environmentId?: string;
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
  ).describe(options);
}
