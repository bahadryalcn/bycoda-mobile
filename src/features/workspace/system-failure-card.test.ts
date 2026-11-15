import { describe, expect, it, vi } from "vitest";
import { createElement as h, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("react-native", () => ({
  View: ({ children, style }: PropsWithChildren<{ style?: { borderColor?: string } }>) =>
    h("div", { "data-border": style?.borderColor }, children),
}));
vi.mock("lucide-react-native/icons/circle-alert", () => ({ default: () => h("i", null, "alert") }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: () => h("i", null, "warning") }));
vi.mock("@/ui/typography", () => ({ Body: ({ children }: PropsWithChildren) => h("p", null, children) }));
vi.mock("@/ui/feedback", () => ({ Badge: ({ label }: { label: string }) => h("b", null, label) }));
vi.mock("@/ui/primitives", () => ({ Disclosure: ({ children }: PropsWithChildren) => h("details", null, children) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/error-message", () => ({ friendlyProviderFailure: (text: string) => text }));
vi.mock("@/ui/theme", () => ({
  useMobileTheme: () => ({
    colors: { danger: "danger", raised: "raised" },
    semanticColors: { warning: { border: "warning", surface: "warning-surface", text: "warning-text" } },
  }),
}));
vi.mock("@/ui/tokens", () => ({ fontSize: {}, lineHeight: {}, radii: {}, space: {} }));
import { SystemFailureCard } from "./system-failure-card";

const render = (text: string) => renderToStaticMarkup(h(SystemFailureCard, { text }));

describe("system failure card", () => {
  it("shows a usage limit as a warning, like desktop", () => {
    const html = render("You've hit your usage limit · resets 5pm");
    expect(html).toContain('data-border="warning"');
    expect(html).toContain("Usage limit reached · resets 5pm");
    expect(render("usage_limit_reached")).toContain('data-border="warning"');
  });
  it("keeps other failures in danger tone", () => {
    const html = render("Provider crashed");
    expect(html).toContain('data-border="danger"');
    expect(html).toContain("alert");
  });
});
