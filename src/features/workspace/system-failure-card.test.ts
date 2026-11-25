import { describe, expect, it, vi } from "vitest";
import { createElement as h, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("@/ui/typography", () => ({ Body: ({ children }: PropsWithChildren) => h("p", null, children) }));
vi.mock("@/ui/feedback", () => ({
  StatusLine: ({ label, tone }: { label: string; tone: string }) => h("output", { "data-tone": tone }, label),
}));
vi.mock("@/ui/primitives", () => ({ Disclosure: ({ children }: PropsWithChildren) => h("details", null, children) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/error-message", () => ({ friendlyProviderFailure: (text: string) => text }));
vi.mock("@/ui/tokens", () => ({ space: {} }));
import { SystemFailureCard, failureHeadline } from "./system-failure-card";

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
