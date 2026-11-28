import { describe, expect, it, vi } from "vitest";
import { createElement as h, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("@/ui/typography", () => ({ Body: ({ children }: PropsWithChildren) => h("p", null, children) }));
vi.mock("@/ui/feedback", () => ({
  StatusLine: ({ label, tone, action }: { label: string; tone: string; action?: { label: string } }) =>
    h("output", { "data-tone": tone }, label, action ? h("button", null, action.label) : null),
}));
vi.mock("@/ui/primitives", () => ({ Disclosure: ({ children }: PropsWithChildren) => h("details", null, children) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/error-message", () => ({ friendlyProviderFailure: (text: string) => text }));
vi.mock("@/ui/tokens", () => ({ space: {} }));
vi.mock("lucide-react-native/icons/square", () => ({ default: () => h("i", { "data-icon": "square" }) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: { muted: "#888" } }) }));
vi.mock("@/ui/chat-styles", () => ({ useChatTextStyles: () => ({ metadata: {} }) }));
vi.mock("@/state/chat-appearance", () => ({ useChatAppearance: () => "default" }));
import { SystemFailureCard, SystemNoticeRow, failureHeadline, isCompactSystemNotice, systemNoticeLine } from "./system-failure-card";
import { FailureRecoveryContext, type FailureRecovery } from "./failure-recovery";

const render = (text: string, repeat?: number) => renderToStaticMarkup(h(SystemFailureCard, { text, repeat }));

describe("system failure status line", () => {
  it("shows a usage limit as a warning, like desktop", () => {
    const html = render("You've hit your usage limit · resets 5pm");
    expect(html).toContain('data-tone="warning"');
    expect(html).toContain("Usage limit reached · resets 5pm");
    expect(render("usage_limit_reached")).toContain('data-tone="warning"');
  });
  it("keeps other failures in danger tone on one line with the repeat count", () => {
    const html = render("Provider crashed", 3);
    expect(html).toContain('data-tone="danger"');
    expect(html).toContain("Provider crashed ×3");
    expect(html).not.toContain("<details>");
  });
  it("puts the rest of a multi-line failure behind Details", () => {
    const html = render("Provider crashed\n\nStack line 1");
    expect(html).toContain(">Provider crashed</output>");
    expect(html).toContain("<details>");
    expect(failureHeadline("\n  First\nSecond")).toBe("First");
  });
});

describe("failed turn recovery on its card", () => {
  const withRecovery = (recovery: FailureRecovery, id: string, text = "Provider crashed") =>
    renderToStaticMarkup(h(FailureRecoveryContext.Provider, { value: recovery }, h(SystemFailureCard, { id, text })));
  it("shows Retry only on the failure it belongs to", () => {
    const recovery = { retry: { errorId: "e2", pending: false, onRetry: () => {} } };
    expect(withRecovery(recovery, "e2")).toContain("<button>Retry</button>");
    expect(withRecovery(recovery, "e1")).not.toContain("Retry");
    expect(withRecovery({ retry: { ...recovery.retry, pending: true } }, "e2")).not.toContain("<button>");
  });
  it("draws the usage-limit notice in place of the line and keeps its Details", () => {
    const html = withRecovery(
      { usageLimit: { errorId: "e3", render: (details) => h("section", null, "limit notice", details) } },
      "e3",
      "You've hit your usage limit\nraw provider text",
    );
    expect(html).toContain("<section>limit notice<details>");
    expect(html).not.toContain("<output");
  });
});

describe("compact system notices", () => {
  const copy = (_tr: string, en: string) => en;
  it("speaks product words for Stop and interruption markers, never the Host's English", () => {
    expect(systemNoticeLine({ role: "system", notice: "interrupt", text: "Stopped by you." }, copy)).toEqual({ tone: "neutral", label: "You stopped" });
    expect(systemNoticeLine({ role: "system", notice: "interrupt", text: "Turn interrupted when bycoda quit." }, copy).label).toBe("This turn was cut off.");
  });
  it("shows an unreceipted owner Stop as one muted square line, not a notice card", () => {
    const html = renderToStaticMarkup(h(SystemNoticeRow, { block: { role: "system", text: "Stopped by you." } }));
    expect(html).toContain('data-icon="square"');
    expect(html).toContain("You stopped");
    expect(html).not.toContain("Stopped by you.");
    expect(html).not.toContain("<output");
  });
  it("shows an info notice as its first line with the rest behind Details", () => {
    expect(systemNoticeLine({ role: "system", notice: "info", text: "Sign in to GitHub MCP\nOpen settings" }, copy)).toEqual({
      tone: "info",
      label: "Sign in to GitHub MCP",
      detail: "Sign in to GitHub MCP\nOpen settings",
    });
    const html = renderToStaticMarkup(h(SystemNoticeRow, { block: { role: "system", notice: "info", text: "One line" } }));
    expect(html).toContain('data-tone="info"');
    expect(html).not.toContain("<details>");
  });
  it("leaves errors, records and structured notices to their own presentation", () => {
    expect(isCompactSystemNotice({ role: "system", notice: "info", text: "x" })).toBe(true);
    expect(isCompactSystemNotice({ role: "system", notice: "error", text: "x" })).toBe(false);
    expect(isCompactSystemNotice({ role: "system", notice: "info", text: "x", shell: { command: "ls" } })).toBe(false);
    expect(isCompactSystemNotice({ role: "tool", notice: "interrupt", text: "x" })).toBe(false);
  });
});
