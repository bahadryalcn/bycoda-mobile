export type PrChecks = { headOid: string; checks: { name: string; workflow: string; state: string; url?: string | null }[] };
export type PrLabels = { labels: { name: string; color: string }[]; available: { name: string; color: string }[]; truncated: boolean };
export type PrReviewers = { reviewRequests: { login?: string; name?: string }[]; latestReviews: { author: { login: string }; state: string }[] };
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid pull request response");
  return value as Record<string, unknown>;
};
const text = (value: unknown, limit = 1000): string => {
  if (typeof value !== "string" || value.length > limit || value.includes("\0")) throw Error("Invalid pull request response");
  return value;
};
const rows = (value: unknown): unknown[] => {
  if (!Array.isArray(value) || value.length > 1000) throw Error("Invalid pull request collection");
  return value;
};
export function readPrChecks(value: unknown): PrChecks {
  const row = record(value), headOid = text(row.headOid);
  if (!/^[a-f0-9]{40}$/i.test(headOid)) throw Error("Invalid checks head SHA");
  return { headOid, checks: rows(row.checks).map(value => {
    const check = record(value);
    return { name: text(check.name), workflow: text(check.workflow), state: text(check.state), url: check.url == null ? null : text(check.url, 4000) };
  }) };
}
export function readPrLabels(value: unknown): PrLabels {
  const row = record(value);
  const labels = (value: unknown) => rows(value).map(value => { const label = record(value); return { name: text(label.name, 100), color: text(label.color, 20) }; });
  if (typeof row.truncated !== "boolean") throw Error("Invalid label completeness");
  return { labels: labels(row.labels), available: labels(row.available), truncated: row.truncated };
}
export function readPrReviewers(value: unknown): PrReviewers {
  const row = record(value);
  return { reviewRequests: rows(row.reviewRequests).map(value => {
    const reviewer = record(value);
    if (reviewer.login === undefined && reviewer.name === undefined) throw Error("Invalid reviewer");
    return { ...(reviewer.login === undefined ? {} : { login: text(reviewer.login, 100) }), ...(reviewer.name === undefined ? {} : { name: text(reviewer.name, 200) }) };
  }), latestReviews: rows(row.latestReviews).map(value => { const review = record(value); return { author: { login: text(record(review.author).login, 100) }, state: text(review.state, 100) }; }) };
}
