export type PrTarget = { url: string } | { number: number };
export type PrInput = { ok: true; target: PrTarget } | { ok: false; reason: "empty" | "invalid" };
export type LinkedPullRequest = { watchId: string; number: number; url: string; state: string };

const PR_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]{0,8}(?:[/?#].*)?$/;
const PR_NUMBER = /^#?([1-9][0-9]{0,8})$/;

/** Reads what the owner typed: a github.com pull request link or a number such as 42 or #42. */
export function parsePullRequestInput(raw: string): PrInput {
  const text = raw.trim();
  if (!text) return { ok: false, reason: "empty" };
  const number = PR_NUMBER.exec(text);
  if (number) return { ok: true, target: { number: Number(number[1]) } };
  return PR_URL.test(text) ? { ok: true, target: { url: text } } : { ok: false, reason: "invalid" };
}

type SessionLike = { id: string; updatedAt?: number; cwd?: string };

/** The session a pull request link attaches to: newest in this checkout, else newest in the project. */
export function pickLinkSession<T extends SessionLike>(sessions: readonly T[] | undefined, cwd?: string): T | undefined {
  const newest = (list: readonly T[]) => list.reduce<T | undefined>((best, s) => (!best || (s.updatedAt ?? 0) > (best.updatedAt ?? 0) ? s : best), undefined);
  const here = cwd ? sessions?.filter((s) => s.cwd === cwd) : undefined;
  return newest(here?.length ? here : sessions ?? []);
}

export function pullRequestTone(state: string): "success" | "danger" | "default" {
  return state === "OPEN" ? "success" : state === "CLOSED" ? "danger" : "default";
}
export function pullRequestStateLabel(state: string, copy: (tr: string, en: string) => string): string {
  return state === "OPEN" ? copy("Açık", "Open") : state === "MERGED" ? copy("Birleştirildi", "Merged") : state === "CLOSED" ? copy("Kapalı", "Closed") : state;
}

/** Why linking is unavailable now, or "" when it is possible. */
export function linkPullRequestReason(opts: { remote?: string | null; hasSession: boolean }, copy: (tr: string, en: string) => string): string {
  if (!opts.remote) return copy("Bu dalın uzak deposu yok.", "This branch has no remote.");
  if (!opts.hasSession) return copy("Bağlanacak oturum yok. Önce bir oturum başlat.", "No session to link to. Start a session first.");
  return "";
}
