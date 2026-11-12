import { create } from "zustand";
import { consentCovers, consentScope } from "./consent-store";

type Computer = { environmentId: string; providers?: readonly string[] };
export const useProviderPermission = create<{
  scopes: Record<string, boolean>;
}>(() => ({ scopes: {} }));

/** True when this scope, or a consented superset on the same computer, is allowed. */
export function isScopePermitted(scopes: Record<string, boolean>, scope: string): boolean {
  if (!scope) return false;
  if (scopes[scope] === true) return true;
  return Object.entries(scopes).some(([granted, allowed]) => allowed && consentCovers(granted, scope));
}

export function hasProviderPermission(computer: Computer | null | undefined) {
  return (
    !!computer &&
    isScopePermitted(
      useProviderPermission.getState().scopes,
      consentScope(computer.environmentId, computer.providers ?? []),
    )
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
