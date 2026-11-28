import { wholePercent, type UsageLimitsReport } from "../tools/usage-limits-model";
import type { RemoteProvider } from "./wire";

/** What the Host's quota report says about one account, for the picker's account rows. */
export type AccountUsage =
  | { kind: "left"; percent: number }
  | { kind: "exhausted"; resetsAt: number | null };

/** The report and the model catalogue both name the Host's own login "default". */
const DEFAULT_ACCOUNT_ID = "default";

/**
 * The tightest quota window of an account in the raw Host report (account ids are the catalogue's
 * profile ids; no account id is the default login). Provider-wide windows win over per-model ones.
 * A window whose reset already passed is stale and ignored. Undefined without a reading.
 */
export function accountUsage(
  report: UsageLimitsReport | undefined,
  provider: RemoteProvider,
  accountId: string | undefined,
  now: number,
): AccountUsage | undefined {
  const entry = report?.providers.find((item) => item.provider === provider);
  if (!entry) return undefined;
  const id = accountId ?? DEFAULT_ACCOUNT_ID;
  const readings = (shared: boolean) => entry.cards
    .filter((card) => (card.model === null) === shared)
    .flatMap((card) => card.accounts.filter((account) => account.id === id).map((account) => account.reading))
    .filter((reading) => reading.resetsAt === null || reading.resetsAt > now);
  const shared = readings(true);
  const windows = shared.length ? shared : readings(false);
  if (!windows.length) return undefined;
  const exhausted = windows.filter((reading) => wholePercent(reading.leftPercent) === 0);
  if (exhausted.length) {
    // Usable again once every used-up window has reset.
    const resets = exhausted.map((reading) => reading.resetsAt);
    return { kind: "exhausted", resetsAt: resets.includes(null) ? null : Math.max(...(resets as number[])) };
  }
  return { kind: "left", percent: wholePercent(Math.min(...windows.map((reading) => reading.leftPercent))) };
}
