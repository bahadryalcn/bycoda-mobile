import { useEffect, useMemo } from "react";
import { createHostClient, type HostClient } from "../api/hostClient";
import { credentials, useMachines } from "./machines";
import { assertAppAccess, useSecurity } from "./security";
import {
  assertProviderPermission,
  readPermittedCredential,
  useProviderPermission,
} from "../features/privacy/consent-access";
import { consentScope } from "../features/privacy/consent-store";

/** Legacy screens use the canonical saved machine and request-time credential gate. */
export function useHostClient(machineId?: string): HostClient | null {
  const activeId = useMachines((state) => state.activeId);
  const id = machineId ?? activeId;
  const machine = useMachines((state) => state.machines.find((value) => value.id === id));
  const allowed = useSecurity((state) => state.status === "unlocked");
  const scope = machine ? consentScope(machine.environmentId, machine.providers ?? []) : "";
  const consented = useProviderPermission((state) => state.scopes[scope] === true);
  const client = useMemo(() => {
    if (!machine || !allowed || !consented) return null;
    const assertAccess = () => {
      assertAppAccess();
      assertProviderPermission(
        useMachines.getState().machines.find((value) => value.id === machine.id),
      );
    };
    return createHostClient(
      {
        id: machine.id,
        endpoint: machine.endpoint,
        lanKey: machine.lanKey,
        environmentId: machine.environmentId,
        token: "",
      },
      undefined,
      () => readPermittedCredential(() => credentials.get(machine.id, machine), assertAccess),
      assertAccess,
    );
  }, [
    machine?.id,
    machine?.endpoint,
    machine?.lanKey,
    machine?.environmentId,
    allowed,
    consented,
    scope,
  ]);
  useEffect(() => {
    client?.reconnect();
    return () => client?.disconnect();
  }, [client]);
  return client;
}
