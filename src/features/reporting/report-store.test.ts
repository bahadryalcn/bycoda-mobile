import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyReportDraft,
  limitReportText,
  maxReportExcerpt,
  reportEmailUrl,
} from "./report-model";
import {
  discardContentReport,
  openContentReportEmail,
  startContentReport,
  updateContentReport,
  useContentReport,
} from "./report-store";

const recipient = "support@example.test";
const ready = () => {
  updateContentReport({ reason: "privacy", description: "Please review this response." });
  updateContentReport({ consent: true });
};

beforeEach(discardContentReport);

describe("content report email privacy", () => {
  it("omits an unselected excerpt and encodes draft text without creating extra recipients or headers", () => {
    const draft = {
      ...emptyReportDraft(),
      description: "A & B?\ncc=someone@example.test\nTürkçe 🙂",
      excerpt: "private excerpt",
      consent: true,
    };
    const url = new URL(reportEmailUrl(draft, recipient, true));
    expect(url.pathname).toBe(recipient);
    expect([...url.searchParams.keys()]).toEqual(["subject", "body"]);
    expect(url.searchParams.get("body")).toContain(draft.description);
    expect(url.searchParams.get("body")).not.toContain("private excerpt");
    expect(url.searchParams.get("body")).not.toMatch(/host|session|device|project/i);
    expect(() => reportEmailUrl(draft, "support?bcc=another@example.test", false)).toThrow(
      "recipient",
    );
  });

  it("shares only the explicitly selected and edited excerpt", () => {
    startContentReport("original private content");
    updateContentReport({
      description: "Concern",
      excerpt: "Redacted content",
      includeExcerpt: true,
    });
    updateContentReport({ consent: true });
    const body = new URL(
      reportEmailUrl(useContentReport.getState().draft, recipient, false),
    ).searchParams.get("body");
    expect(body).toContain("Redacted content");
    expect(body).not.toContain("original private content");
    updateContentReport({ excerpt: "Second redaction" });
    expect(useContentReport.getState().draft.consent).toBe(false);
  });

  it("bounds emoji without cutting a surrogate pair and preserves a composed report on another entry", () => {
    expect(limitReportText("🙂🙂x", 1)).toBe("🙂");
    startContentReport("🙂".repeat(maxReportExcerpt + 1));
    expect(Array.from(useContentReport.getState().draft.excerpt)).toHaveLength(maxReportExcerpt);
    ready();
    const previous = useContentReport.getState().draft;
    startContentReport("replacement");
    expect(useContentReport.getState().draft).toBe(previous);
  });
});

describe("email composer state", () => {
  it("does not open email until there is a description, consent and app access", async () => {
    const openURL = vi.fn(async () => {});
    const assertAccess = vi.fn();
    await openContentReportEmail({ recipient, turkish: false, assertAccess, openURL });
    expect(useContentReport.getState().error).toBe("description");
    updateContentReport({ description: "Concern" });
    await openContentReportEmail({ recipient, turkish: false, assertAccess, openURL });
    expect(useContentReport.getState().error).toBe("consent");
    ready();
    await expect(
      openContentReportEmail({
        recipient,
        turkish: false,
        assertAccess: () => {
          throw new Error("locked");
        },
        openURL,
      }),
    ).rejects.toThrow("locked");
    expect(openURL).not.toHaveBeenCalled();
  });

  it("keeps the draft after failure and after email opening, without marking it sent", async () => {
    ready();
    const previous = useContentReport.getState().draft;
    await openContentReportEmail({
      recipient,
      turkish: false,
      assertAccess: () => {},
      openURL: async () => {
        throw new Error("No mail application");
      },
    });
    expect(useContentReport.getState()).toMatchObject({
      status: "idle",
      error: "open",
      draft: previous,
    });
    await openContentReportEmail({
      recipient,
      turkish: false,
      assertAccess: () => {},
      openURL: async () => {},
    });
    expect(useContentReport.getState()).toMatchObject({
      status: "opened",
      error: null,
      draft: previous,
    });
    discardContentReport();
    expect(useContentReport.getState().draft).toEqual(emptyReportDraft());
  });

  it("deduplicates composer taps and ignores a result arriving after explicit discard", async () => {
    ready();
    let finish!: () => void;
    const openURL = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const options = { recipient, turkish: false, assertAccess: () => {}, openURL };
    const pending = openContentReportEmail(options);
    await openContentReportEmail(options);
    expect(openURL).toHaveBeenCalledTimes(1);
    discardContentReport();
    finish();
    await pending;
    expect(useContentReport.getState()).toMatchObject({
      status: "idle",
      draft: emptyReportDraft(),
    });
  });

  it("keeps unsent form data and suppresses a late success after access locks", async () => {
    ready();
    let unlocked = true;
    let finish!: () => void;
    const previous = useContentReport.getState().draft;
    const pending = openContentReportEmail({
      recipient,
      turkish: false,
      assertAccess: () => {
        if (!unlocked) throw new Error("locked");
      },
      openURL: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    });
    unlocked = false;
    finish();
    await pending;
    expect(useContentReport.getState()).toMatchObject({
      status: "idle",
      error: null,
      draft: previous,
    });
  });
});
