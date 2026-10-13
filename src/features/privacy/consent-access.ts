import { create } from "zustand";
import { consentScope } from "./consent-store";

type Computer = { environmentId: string; providers?: readonly string[] };
export const useProviderPermission = create<{
  scopes: Record<string, boolean>;
}>(() => ({ scopes: {} }));

export function hasProviderPermission(computer: Computer | null | undefined) {
  return (
    !!computer &&
    useProviderPermission.getState().scopes[
      consentScope(computer.environmentId, computer.providers ?? [])
    ] === true
  );
}

export function assertProviderPermission(computer: Computer | null | undefined) {
  if (!hasProviderPermission(computer))
    throw new Error("Allow data sharing with this computer and its providers before connecting.");
}

/** Recheck after secure storage resolves so revocation also blocks a stale client. */
export async function readPermittedCredential(
  read: () => Promise<string | null>,
  guard: () => void,
) {
  guard();
  const credential = await read();
  guard();
  return credential;
}
