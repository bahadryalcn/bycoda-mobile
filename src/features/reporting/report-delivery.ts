import { reportDraftError, type ReportDraft } from "./report-model";

export type ReportPayload = { reason: ReportDraft["reason"]; description: string; excerpt?: string };
export type ReportReceipt = { requestId: string; reportId: string };
export type ReportSender = (requestId: string, payload: ReportPayload) => Promise<ReportReceipt>;

/** Only explicitly reviewed content leaves the app; never attach host or session metadata. */
export function reportPayload(draft: ReportDraft): ReportPayload {
  if (reportDraftError(draft)) throw new Error("Report requires review and consent");
  return {
    reason: draft.reason,
    description: draft.description.trim(),
    ...(draft.includeExcerpt && draft.excerpt.trim() ? { excerpt: draft.excerpt.trim() } : {}),
  };
}

/** Build-owned configuration only. No redirects, URL credentials, query secrets or insecure endpoints. */
export function reportEndpoint(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) return null;
    return url.href;
  } catch { return null; }
}

/** Firebase onRequest HTTP contract, not the onCall protocol. No SDK or service is activated here. */
export function createFirebaseReportSender(endpoint: unknown, request: typeof fetch = fetch): ReportSender | null {
  const url = reportEndpoint(endpoint);
  if (!url) return null;
  return async (requestId, payload) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await request(url, {
        method: "POST", credentials: "omit", redirect: "error",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ version: 1, requestId, ...payload }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Report delivery was not confirmed");
      const text = await response.text();
      if (text.length > 4096) throw new Error("Invalid report receipt");
      const receipt: unknown = JSON.parse(text);
      if (!receipt || typeof receipt !== "object" || !("requestId" in receipt) ||
        receipt.requestId !== requestId || !("reportId" in receipt) ||
        typeof receipt.reportId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(receipt.reportId)) {
        throw new Error("Invalid report receipt");
      }
      return { requestId, reportId: receipt.reportId };
    } finally { clearTimeout(timer); }
  };
}
