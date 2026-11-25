import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ sampledAt: 1794564000000, resetsAt: null as number | null, credits: null as number | null, windows: 1 }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: Record<string, string | number>) => en.replace(/\{(p\d+)\}/g, (placeholder, key) => String(values?.[key] ?? placeholder)) }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ environmentId: "fixture", capabilities: ["usage.limits.read"] }) }));
vi.mock("@/state/queries", () => ({ useHostQuery: () => {
  const reading = { leftPercent: 25, usedPercent: 75, regainPercent: 75, windowMinutes: 300, resetsAt: fixture.resetsAt, timeLeftPercent: null, pace: null };
  return { isSuccess: true, data: { sampledAt: fixture.sampledAt, providers: [{ provider: "claude", cards: Array.from({ length: fixture.windows }, (_, index) => ({ key: String(index), kind: index === 0 ? "session" : "weekly", model: null, best: reading, accounts: [{ id: "research", label: "İstanbul araştırma hesabı 🧪", color: "fixture", reading }] })), accounts: [{ id: "research", label: "İstanbul araştırma hesabı 🧪", status: "ok", resetCredits: fixture.credits }] }] } };
} }));
vi.mock("@/ui/primitives", () => {
  const Item = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Item, Button: ({ label }: { label: string }) => createElement("button", null, label), StatusText: ({ label }: { label: string }) => createElement("span", null, label), Card: Item, StatusRow: ({ label, children }: PropsWithChildren<{ label: string }>) => createElement("div", null, label, children), QueryState: () => null, SectionHeader: ({ title, trailing }: { title: string; trailing?: unknown }) => createElement("h2", null, title, trailing as never) };
});
vi.mock("@/ui/metric-value", () => ({ MetricValue: ({ children }: PropsWithChildren) => createElement("strong", null, children) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ uiStyles: { caption: {} } }) }));
vi.mock("@/ui/info-hint", () => ({ useInfoHint: () => ({ button: null, panel: null }) }));
vi.mock("@/ui/provider-account-kind", () => ({ ProviderAccountKind: () => null }));
vi.mock("@/ui/usage-meters", () => ({ RemainingMeter: () => null, AccountMeter: () => null }));
vi.mock("panelui-native/components/badge", () => ({ Badge: () => null }));

import { UsageLimits } from "./usage-limits";

beforeEach(() => { fixture.resetsAt = null; fixture.credits = null; fixture.windows = 1; });

const short = (at: number) => {
  const date = new Date(at);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleString("en", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

it("shows a short sample time and keeps unknown reset time unknown", () => {
  const html = renderToStaticMarkup(createElement(UsageLimits));
  expect(html).toContain(`Last reading ${short(fixture.sampledAt)}`);
  expect(html).not.toContain(new Date(fixture.sampledAt).toLocaleString("en"));
  expect(html).toContain("Reset time unknown");
  expect(html).not.toContain("Resets at");
  expect(html).not.toContain("Reset credits");
});

it("names a single account once beside the provider instead of under each card", () => {
  fixture.windows = 2;
  const html = renderToStaticMarkup(createElement(UsageLimits));
  expect(html.match(/İstanbul araştırma hesabı/g)).toHaveLength(1);
});

it("hides zero reset credits and shows a positive entitlement with a short reset time", () => {
  fixture.windows = 2;
  fixture.resetsAt = 1794567600000;
  fixture.credits = 0;
  expect(renderToStaticMarkup(createElement(UsageLimits))).not.toContain("Reset credits");
  fixture.credits = 1000;
  const html = renderToStaticMarkup(createElement(UsageLimits));
  expect(html).toContain(`Reset credits: ${(1000).toLocaleString("en")}`);
  expect(html.match(/Reset credits:/g)).toHaveLength(1);
  expect(html).toContain("5-hour");
  expect(html).toContain("Weekly");
  expect(html).toContain(`Resets at ${short(fixture.resetsAt)}`);
  expect(html).not.toContain("Reset time unknown");
});
