import { useQuery } from "@tanstack/react-query";
import { AccountApiError, type Computer } from "../account/contracts";
import { useAccount } from "../account/ui/account-context";
import type { MobileMachine } from "@/remote/types";
import { routeKind } from "@/state/route-kind";

export const COMPUTERS_KEY = ["account", "computers"] as const;
/** A desktop that has not checked in for this long is shown as offline. */
export const ONLINE_WINDOW_MS = 3 * 60_000;

export function isComputerOnline(computer: Pick<Computer, "lastSeenAt">, now = Date.now()): boolean {
  const seen = Date.parse(computer.lastSeenAt);
  return Number.isFinite(seen) && now - seen < ONLINE_WINDOW_MS;
}

/** An old API without `/v1/computers` answers 404 or 405; the section hides instead of erroring. */
export function isComputersUnavailable(error: unknown): boolean {
  return (
    error instanceof AccountApiError &&
    (error.status === 404 || error.status === 405 || error.status === 501)
  );
}

export function routeKinds(computer: Pick<Computer, "routes">): { lan: boolean; tailscale: boolean; public: boolean } {
  const found = { lan: false, tailscale: false, public: false };
  for (const route of computer.routes) {
    // Same rule as pairing (`pairingRouteIsPublic`): an unkeyed HTTPS address that is not a tailnet
    // name is saved as a public-internet route, so the list labels it that way before pairing too.
    const kind = routeKind(route) ?? "public";
    found[kind] = true;
  }
  return found;
}

export function savedComputerFor(
  computer: Pick<Computer, "environmentId">,
  machines: readonly MobileMachine[],
): MobileMachine | undefined {
  return machines.find((machine) => machine.environmentId === computer.environmentId);
}

export type AccountComputersState =
  | { kind: "hidden" }
  | { kind: "signedOut" }
  | { kind: "loading" }
  | { kind: "error"; error: unknown }
  | { kind: "ready"; computers: Computer[] };

/** A dropped or overloaded read gets two quiet retries; a refusal is final. */
export function retryAccountComputers(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  return !(error instanceof AccountApiError) || error.status === 429 || error.status >= 500;
}

/** A loaded list stays on screen through a failed refresh; only a first load reports the failure. */
export function accountComputersRead(
  data: { items: Computer[] } | undefined,
  error: unknown,
  now: number,
): AccountComputersState {
  if (error && isComputersUnavailable(error)) return { kind: "hidden" };
  if (data) {
    const computers = [...data.items].sort(
      (a, b) => Number(isComputerOnline(b, now)) - Number(isComputerOnline(a, now)),
    );
    return { kind: "ready", computers };
  }
  return error ? { kind: "error", error } : { kind: "loading" };
}

/** Computers of the signed-in account, online first. Refetch is exposed for focus handling. */
export function useAccountComputers(): { state: AccountComputersState; refetch: () => void } {
  const account = useAccount();
  const enabled = account.status === "signedIn" && !!account.runtime && !!account.device;
  const query = useQuery({
    queryKey: COMPUTERS_KEY,
    queryFn: () => account.runtime!.client.listComputers(),
    enabled,
    retry: retryAccountComputers,
    // Short focus returns (notification shade) reuse a recent list; well inside ONLINE_WINDOW_MS.
    staleTime: 30_000,
  });
  const refetch = () => {
    if (enabled) void query.refetch();
  };
  let state: AccountComputersState;
  if (account.status === "unavailable" || account.status === "loading") state = { kind: "hidden" };
  else if (account.status === "signedOut") state = { kind: "signedOut" };
  else state = accountComputersRead(query.data, query.error, Date.now());
  return { state, refetch };
}
