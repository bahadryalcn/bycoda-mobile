import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyReportDraft, limitReportText, maxReportExcerpt } from "./report-model";
import { reportPayload, createFirebaseReportSender, reportEndpoint, type ReportReceipt } from "./report-delivery";
import { discardContentReport, sendContentReport, startContentReport, updateContentReport, useContentReport } from "./report-store";

const ready = () => {
  updateContentReport({ reason: "privacy", description: "Please review this response." });
  updateContentReport({ consent: true });
};
const options = () => ({
  sender: vi.fn(async (requestId: string) => ({ requestId, reportId: "receipt-1" })),
  newRequestId: vi.fn(() => "request-1"),
  assertAccess: vi.fn(),
});
beforeEach(discardContentReport);

describe("report privacy and delivery", () => {
  it("only serializes selected content and requires consent", () => {
    const draft = { ...emptyReportDraft(), description: "A & B?\nTürkçe 🙂", excerpt: "private", consent: true };
    expect(reportPayload(draft)).toEqual({ reason: "other", description: draft.description });
    expect(reportPayload({ ...draft, excerpt: "redacted", includeExcerpt: true }).excerpt).toBe("redacted");
    expect(() => reportPayload({ ...draft, consent: false })).toThrow();
  });
  it("bounds emoji and preserves an existing composed draft", () => {
    expect(limitReportText("🙂🙂x", 1)).toBe("🙂");
    startContentReport("🙂".repeat(maxReportExcerpt + 1));
    expect(Array.from(useContentReport.getState().draft.excerpt)).toHaveLength(maxReportExcerpt);
    ready();
    const previous = useContentReport.getState().draft;
    startContentReport("replacement");
    expect(useContentReport.getState().draft).toBe(previous);
  });
  it("requires validation, consent, access and a configured service before sending", async () => {
    const opts = options();
    await sendContentReport(opts);
    expect(useContentReport.getState().error).toBe("description");
    updateContentReport({ description: "Concern" });
    await sendContentReport(opts);
    expect(useContentReport.getState().error).toBe("consent");
    ready();
    await sendContentReport({ ...opts, sender: null });
    expect(useContentReport.getState().error).toBe("service");
    await expect(sendContentReport({ ...opts, assertAccess: () => { throw new Error("locked"); } })).rejects.toThrow("locked");
    expect(opts.sender).not.toHaveBeenCalled();
  });
  it("retains draft and retry identity on uncertain delivery; edits reset consent and identity", async () => {
    ready();
    const opts = options();
    opts.sender.mockRejectedValueOnce(new Error("network"));
    const draft = useContentReport.getState().draft;
    await sendContentReport(opts);
    expect(useContentReport.getState()).toMatchObject({ status: "idle", error: "send", draft, requestId: "request-1" });
    await sendContentReport(opts);
    expect(opts.newRequestId).toHaveBeenCalledTimes(1);
    expect(useContentReport.getState()).toMatchObject({ status: "sent", receiptId: "receipt-1", draft });
    await sendContentReport(opts);
    expect(opts.sender).toHaveBeenCalledTimes(2);
    updateContentReport({ description: "Edited report" });
    expect(useContentReport.getState()).toMatchObject({ status: "idle", requestId: null, receiptId: null, draft: { consent: false } });
  });
  it("deduplicates taps and ignores completion after discard", async () => {
    ready();
    let finish!: (receipt: ReportReceipt) => void;
    const opts = { ...options(), sender: vi.fn(() => new Promise<ReportReceipt>(resolve => { finish = resolve; })) };
    const pending = sendContentReport(opts);
    await sendContentReport(opts);
    expect(opts.sender).toHaveBeenCalledTimes(1);
    updateContentReport({ description: "Cannot replace in flight" });
    expect(useContentReport.getState().draft.description).toBe("Please review this response.");
    discardContentReport();
    finish({ requestId: "request-1", reportId: "old" });
    await pending;
    expect(useContentReport.getState()).toMatchObject({ status: "idle", receiptId: null, draft: emptyReportDraft() });
  });
  it("does not acknowledge a stale or mismatched receipt after lock", async () => {
    ready();
    const opts = options();
    opts.sender.mockResolvedValueOnce({ requestId: "different", reportId: "wrong" });
    await sendContentReport(opts);
    expect(useContentReport.getState().status).toBe("idle");
    opts.sender.mockImplementationOnce(async requestId => {
      opts.assertAccess.mockImplementation(() => { throw new Error("locked"); });
      return { requestId, reportId: "late" };
    });
    await sendContentReport(opts);
    expect(useContentReport.getState()).toMatchObject({ status: "idle", receiptId: null, error: null });
  });
});

describe("Firebase HTTP adapter", () => {
  it("stays unavailable for missing or unsafe configuration", () => {
    for (const url of [null, "", "http://example.test", "https://u:p@example.test", "https://example.test/?key=secret", "https://example.test/#fragment"]) {
      expect(reportEndpoint(url)).toBeNull();
      expect(createFirebaseReportSender(url)).toBeNull();
    }
  });
  it("uses the configured HTTPS destination without cookies and accepts only a matching receipt", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ requestId: "id-1", reportId: "receipt-1" })));
    const sender = createFirebaseReportSender("https://example.test/report", request)!;
    expect(await sender("id-1", { reason: "privacy", description: "Reviewed" })).toEqual({ requestId: "id-1", reportId: "receipt-1" });
    expect(request).toHaveBeenCalledWith("https://example.test/report", expect.objectContaining({
      method: "POST", credentials: "omit", redirect: "error",
      body: JSON.stringify({ version: 1, requestId: "id-1", reason: "privacy", description: "Reviewed" }),
    }));
  });
  it.each([
    new Response("{}", { status: 200 }),
    new Response(JSON.stringify({ requestId: "another", reportId: "receipt" })),
    new Response(JSON.stringify({ requestId: "id", reportId: "<untrusted>" })),
    new Response("accepted", { status: 202 }),
    new Response("failed", { status: 500 }),
  ])("does not mistake an HTTP response for delivery", async response => {
    const sender = createFirebaseReportSender("https://example.test/report", vi.fn<typeof fetch>().mockResolvedValue(response))!;
    await expect(sender("id", { reason: "other", description: "Concern" })).rejects.toThrow();
  });
});
