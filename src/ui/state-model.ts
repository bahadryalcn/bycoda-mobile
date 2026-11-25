import type { IllustrationName } from "./illustrations";
import type { StateSize } from "./component-props";

/** Art that describes a failure. Errors are never illustrated; StateView draws the small tone icon instead. */
const ERROR_ART = new Set<IllustrationName>(["error", "unreachable", "offline", "locked"]);

export function isErrorArt(name: IllustrationName): boolean {
  return ERROR_ART.has(name);
}

/** Explicit `size` wins; the legacy `compact` flag means the section size; otherwise a region. */
export function resolveStateSize(size: StateSize | undefined, compact = false): StateSize {
  return size ?? (compact ? "compact" : "region");
}

/** Error category behind a failed read: unreachable computer, offline device, locked access or generic. */
export function errorIllustration(kind: string | undefined, offline = false): IllustrationName {
  if (offline || kind === "offline") return "offline";
  if (kind === "network" || kind === "timeout") return "unreachable";
  if (kind === "auth" || kind === "identity" || kind === "access") return "locked";
  return "error";
}

/** Short human heading matching `errorIllustration`; the description carries the specific message. */
export function errorTitle(
  kind: string | undefined,
  copy: (turkish: string, english: string) => string,
  offline = false,
): string {
  const art = errorIllustration(kind, offline);
  if (art === "offline") return copy("Çevrimdışısın", "You're offline");
  if (art === "unreachable") return copy("Bilgisayara ulaşılamıyor", "Can't reach your computer");
  if (art === "locked") return copy("Erişim gerekli", "Access needed");
  return copy("Bir şeyler ters gitti", "Something went wrong");
}

export type QueryFeedbackLoading = "list" | "content" | "inline" | "centered" | "none";

/**
 * Size of a QueryState failure, waiting or empty state. A query that is not the first failure
 * of its Screen/Sheet reports in one line; otherwise an explicit size wins, then `compact`, then
 * the loading shape: a list/content placeholder or centered spinner owns its region, an inline or
 * hidden loader sits in a section.
 */
export function queryStateSize({ size, compact, loading, owner, art }: {
  size?: StateSize; compact?: boolean; loading: QueryFeedbackLoading; owner: boolean;
  /** First-run or empty art requested by the caller keeps the region in the automatic size. */
  art?: boolean;
}): StateSize {
  if (!owner) return "line";
  if (size) return size;
  if (compact) return "compact";
  if (art) return "region";
  return loading === "inline" || loading === "none" ? "compact" : "region";
}
