import { normalizeHostEndpoint, RemoteHostError } from "@/remote/transport";
import type { ComputerConnectionDependencies, ComputerConnectionInput } from "./connection-types";

/** QR and manual entry share identity checks, draft flushing and secure persistence. */
export async function connectComputer(
  input: ComputerConnectionInput,
  dependencies: ComputerConnectionDependencies,
) {
  const check = () => {
    if (dependencies.signal.aborted) {
      throw new RemoteHostError("pairing", "aborted", "Connection cancelled.");
    }
    dependencies.assertAccess();
  };
  check();
  const address = normalizeHostEndpoint(input.endpoint, input.lanKey);
  const credential = input.credential.trim();
  const host = input.lanKey
    ? await dependencies.discover(
        address,
        credential,
        dependencies.signal,
        input.lanKey,
        input.expectedEnvironmentId,
      )
    : await dependencies.discover(address, credential, dependencies.signal);
  check();
  if (input.expectedEnvironmentId && host.environmentId !== input.expectedEnvironmentId) {
    throw new RemoteHostError(
      "pairing",
      "identity",
      "This address belongs to a different computer. Scan a new code.",
    );
  }
  await dependencies.flushDrafts();
  check();
  const machines = dependencies.getMachines();
  const sameHost = machines.find((machine) => machine.environmentId === host.environmentId);
  if (
    input.editingId &&
    machines.find((machine) => machine.id === input.editingId)?.environmentId !== host.environmentId
  ) {
    throw new RemoteHostError(
      "pairing",
      "identity",
      "This address belongs to a different computer. Add it as a new computer.",
    );
  }
  await dependencies.saveMachine(
    {
      id: input.editingId ?? sameHost?.id ?? dependencies.createId(),
      name: input.name.trim() || host.name,
      endpoint: address,
      ...(input.lanKey ? { lanKey: input.lanKey } : {}),
      environmentId: host.environmentId,
      platform: host.platform,
      providers: host.providers,
      capabilities: host.capabilities,
      lastConnectedAt: Date.now(),
    },
    credential,
  );
  check();
}
