import { HostTransport } from "../../remote/host-transport";
import { credentials, useMachines } from "../../state/machines";
import { assertAppAccess } from "../../state/security";
import { assertProviderPermission, readPermittedCredential } from "../privacy/consent-access";
import { collectHostLogs, HOST_LOGS_DEADLINE_MS, HOST_LOGS_METHOD, type CollectedHostLogs } from "./host-logs";

/** Reads the logs of the saved computers (active one first); consent and app lock apply as for any Host call. */
export function collectConnectedHostLogs(): Promise<CollectedHostLogs> {
  const { machines, activeId } = useMachines.getState();
  const ordered = [...machines].sort((a, b) => Number(b.id === activeId) - Number(a.id === activeId));
  return collectHostLogs(ordered, async (entry) => {
    const machine = machines.find((value) => value.id === entry.id);
    if (!machine) return null;
    const assertAccess = () => {
      assertAppAccess();
      assertProviderPermission(useMachines.getState().machines.find((value) => value.id === machine.id));
    };
    const transport = new HostTransport(
      machine,
      () => readPermittedCredential(() => credentials.get(machine.id, machine), assertAccess),
      undefined,
      assertAccess,
    );
    try {
      return await transport.request(HOST_LOGS_METHOD, {}, { timeoutMs: HOST_LOGS_DEADLINE_MS, retry: false });
    } finally {
      transport.dispose?.();
    }
  });
}
