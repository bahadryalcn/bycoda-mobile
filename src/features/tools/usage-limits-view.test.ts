import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ sampledAt: 1794564000000, resetsAt: null as number | null, credits: null as number | null, windows: 1, second: false, failed: false }));
// Usage limits tick only while visible; the visibility owner reads native app state.
vi.mock("@/ui/use-owner-visible", () => ({ useOwnerVisible: () => true }));
vi.mock("react-native", () => {
  const Item = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { View: Item, Pressable: ({ children, accessibilityLabel }: PropsWithChildren<{ accessibilityLabel?: string }>) => createElement("button", { "aria-label": accessibilityLabel }, children), StyleSheet: { hairlineWidth: 1 } };
});
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: Record<string, string | number>) => en.replace(/\{(p\d+)\}/g, (placeholder, key) => String(values?.[key] ?? placeholder)) }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ environmentId: "fixture", capabilities: ["usage.limits.read"] }) }));
vi.mock("@/state/queries", () => ({ useHostQuery: () => {
  const reading = { leftPercent: 25, usedPercent: 75, regainPercent: 75, windowMinutes: 300, resetsAt: fixture.resetsAt, timeLeftPercent: null, pace: null };
  const other = { ...reading, leftPercent: 80 };
  const research = { id: "research", label: "İstanbul araştırma hesabı 🧪", color: "fixture", kind: "work" as const };
  const personal = { id: "personal", label: "Personal", color: "fixture" };
  const cards = Array.from({ length: fixture.windows }, (_, index) => ({
    key: String(index), kind: index === 0 ? "session" : "weekly", model: null, best: fixture.second ? other : reading,
    accounts: fixture.second ? [{ ...personal, reading: other }, { ...research, reading }] : [{ ...research, reading }],
  }));
  const accounts = [
    { ...research, status: fixture.failed ? "error" : "ok", error: fixture.failed ? "Claude usage will update when this account is used again" : null, resetCredits: fixture.credits, observedAt: fixture.sampledAt },
    ...(fixture.second ? [{ ...personal, status: "ok", error: null, resetCredits: 4, observedAt: fixture.sampledAt }] : []),
  ];
  return { isSuccess: true, data: { sampledAt: fixture.sampledAt, providers: [{ provider: "claude", cards, accounts }] } };
} }));
vi.mock("@/ui/primitives", () => {
  const Item = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Item, IconButton: ({ label, children }: PropsWithChildren<{ label: string }>) => createElement("button", { "aria-label": label }, children), StatusText: ({ label }: { label: string }) => createElement("span", null, label), QueryState: () => null, SectionHeader: ({ title, trailing }: { title: string; trailing?: unknown }) => createElement("h2", null, title, trailing as never) };
});
vi.mock("@/ui/metric-value", () => ({ MetricValue: ({ children }: PropsWithChildren) => createElement("strong", null, children) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, semanticColors: { warning: { text: "warning" } }, uiStyles: { caption: {} } }) }));
vi.mock("@/ui/provider-account-kind", () => ({ ProviderAccountKind: ({ kind }: { kind?: string }) => createElement("i", null, `kind:${kind ?? "personal"}`) }));
vi.mock("@/ui/hint", () => ({ Hint: ({ children, label }: PropsWithChildren<{ label: string }>) => createElement("div", { "data-hint": label }, children) }));
vi.mock("lucide-react-native/icons/rotate-ccw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: () => null }));
vi.mock("@/ui/usage-meters", () => ({
  RemainingMeter: () => createElement("meter"),
  NamedMeter: ({ name, glyph }: { name: string; glyph?: (ink: string) => unknown }) => createElement("span", { "data-named-meter": name }, glyph?.("ink") as never, name),
}));
vi.mock("panelui-native/components/badge", () => ({ Badge: ({ children, accessibilityLabel }: PropsWithChildren<{ accessibilityLabel?: string }>) => createElement("em", { "aria-label": accessibilityLabel }, children) }));

import { UsageLimits, UsageLimitsStatus } from "./usage-limits";

beforeEach(() => { fixture.resetsAt = null; fixture.credits = null; fixture.windows = 1; fixture.second = false; fixture.failed = false; });

const short = (at: number) => {
  const date = new Date(at);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleString("en", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

it("keeps the sample time in the quiet header status and unknown reset time unknown", () => {
  expect(renderToStaticMarkup(createElement(UsageLimitsStatus))).toContain(`Updated ${short(fixture.sampledAt)}`);
  const html = renderToStaticMarkup(createElement(UsageLimits));
  expect(html).not.toContain("Updated");
  expect(html).toContain("Reset time unknown");
  expect(html).not.toContain("Reset credits");
});

it("names no account and no kind when the provider has one account", () => {
  fixture.windows = 2;
  const html = renderToStaticMarkup(createElement(UsageLimits));
  expect(html).not.toContain("İstanbul araştırma hesabı");
  expect(html).not.toContain("kind:");
});

it("writes each account inside its bar, kinds as glyphs only when they differ", () => {
  fixture.second = true;
  const html = renderToStaticMarkup(createElement(UsageLimits));
  expect(html).toContain('data-named-meter="Personal"');
  expect(html).toContain('data-named-meter="İstanbul araştırma hesabı 🧪"');
  expect(html).toContain("kind:work");
  expect(html).not.toContain("Work");
});

it("shows reset credits as compact header chips and hides zero", () => {
  fixture.windows = 2;
  fixture.resetsAt = 1794567600000;
  fixture.credits = 0;
  expect(renderToStaticMarkup(createElement(UsageLimits))).not.toContain("Reset credits");
  fixture.credits = 1000;
  let html = renderToStaticMarkup(createElement(UsageLimits));
  expect(html).toContain(`aria-label="Reset credits: ${(1000).toLocaleString("en")}"`);
  expect(html).toContain(`>${(1000).toLocaleString("en")}</em>`);
  expect(html).toContain("5-hour");
  expect(html).toContain(short(fixture.resetsAt));
  expect(html).not.toContain("Reset time unknown");
  fixture.second = true;
  html = renderToStaticMarkup(createElement(UsageLimits));
  expect(html).toContain("Personal 4</em>");
});

it("moves a failed reread into the header warning instead of inline footer lines", () => {
  fixture.failed = true;
  const html = renderToStaticMarkup(createElement(UsageLimits));
  expect(html).not.toContain("updates when this account is used again");
  expect(html).not.toContain("Retry");
  const status = renderToStaticMarkup(createElement(UsageLimitsStatus));
  expect(status).toContain("İstanbul araştırma hesabı 🧪: updates when this account is used again.");
  expect(status).toContain(`Showing the reading from ${short(fixture.sampledAt)}`);
  expect(renderToStaticMarkup(createElement(UsageLimitsStatus))).toContain("Warning");
});
