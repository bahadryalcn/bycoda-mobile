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
  return { Body: Item, Card: Item, StatusRow: ({ label, children }: PropsWithChildren<{ label: string }>) => createElement("div", null, label, children), QueryState: () => null, SectionHeader: ({ title }: { title: string }) => createElement("h2", null, title) };
});
vi.mock("@/ui/info-hint", () => ({ useInfoHint: () => ({ button: null, panel: null }) }));
vi.mock("@/ui/provider-account-kind", () => ({ ProviderAccountKind: () => null }));
vi.mock("@/ui/usage-meters", () => ({ RemainingMeter: () => null, AccountMeter: () => null }));
vi.mock("panelui-native/components/badge", () => ({ Badge: () => null }));

import { UsageLimits } from "./usage-limits";

beforeEach(() => { fixture.resetsAt = null; fixture.credits = null; fixture.windows = 1; });

it("shows source sample time and keeps unknown reset time unknown", () => {
  const html = renderToStaticMarkup(createElement(UsageLimits));
  expect(html).toContain("Last updated: ");
  expect(html).toContain(new Date(fixture.sampledAt).toLocaleString("en"));
  expect(html).toContain("Reset time unknown");
  expect(html).not.toContain("Resets at");
  expect(html).not.toContain("Reset credits");
});

it.each([0, 1000])("labels and locale-formats a known %i reset entitlement with its authoritative reset date", (credits) => {
  fixture.credits = credits;
  fixture.windows = 2;
  fixture.resetsAt = 1794567600000;
  const html = renderToStaticMarkup(createElement(UsageLimits));
  expect(html).toContain(`Reset credits: ${credits.toLocaleString("en")}`);
  expect(html.match(/Reset credits:/g)).toHaveLength(1);
  expect(html).toContain("5-hour");
  expect(html).toContain("Weekly");
  expect(html).toContain(`Resets at ${new Date(fixture.resetsAt).toLocaleString("en")}`);
  expect(html).not.toContain("Reset time unknown");
});
