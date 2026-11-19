import { createElement as h, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

type A11y = { accessibilityLabel?: string; accessibilityLiveRegion?: string; accessibilityRole?: string };
const clock = vi.hoisted(() => ({ now: 0 }));
vi.mock("react-native", () => ({
  View: ({ children, accessibilityLabel, accessibilityLiveRegion, accessibilityRole }: PropsWithChildren<A11y>) =>
    h("div", { "data-label": accessibilityLabel, "data-live": accessibilityLiveRegion, "data-role": accessibilityRole }, children),
  ScrollView: ({ children }: PropsWithChildren) => h("div", null, children),
}));
vi.mock("panelui-native/components/spinner", () => ({ Spinner: () => h("i", null, "spinner") }));
vi.mock("lucide-react-native/icons/globe", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/smartphone", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/users", () => ({ default: () => null }));
vi.mock("@/ui/typography", () => ({ Body: ({ children }: PropsWithChildren) => h("p", null, children) }));
vi.mock("@/ui/primitives", () => ({ PressableCard: ({ children }: PropsWithChildren) => h("button", null, children) }));
vi.mock("@/ui/copy", () => ({
  useCopy: () => (_tr: string, en: string, values?: { p0?: number }) =>
    values?.p0 === undefined ? en : en.replace("{p0}", String(values.p0)),
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: { raised: "r", separator: "s", warning: "w", success: "ok", tertiary: "t", info: "i" } }) }));
vi.mock("@/ui/tokens", () => ({ fontSize: {}, lineHeight: {}, metrics: {}, radii: {}, space: {} }));
vi.mock("./use-elapsed-now", () => ({ useElapsedNow: () => clock.now }));
import { SessionActivityBar } from "./session-activity-bar";

const START = 1_000_000;
const activity = (state: string, extra: object = {}) =>
  ({ state, startedAt: START, counts: { total: 0, running: 0, done: 0, failed: 0, stopped: 0, interrupted: 0 }, waitingOn: { agents: 0, tasks: 0 }, ...extra }) as never;
const render = (a: unknown) => renderToStaticMarkup(h(SessionActivityBar, { activity: a as never, onAgents: () => {}, onDevice: () => {}, onBrowser: () => {} }));
const live = (html: string) => [...html.matchAll(/<div[^>]*data-live="polite"[^>]*>/g)].map((match) => match[0]);
beforeEach(() => { clock.now = START + 65_000; });

it("announces the session state politely but keeps the ticking timer out of the live region", () => {
  const html = render(activity("working"));
  expect(live(html)).toHaveLength(1);
  expect(live(html)[0]).toContain('data-label="Working"');
  expect(live(html)[0]).not.toContain("1:05");
});

it("leaves the elapsed time readable on focus as its own non-live timer element", () => {
  const html = render(activity("working"));
  expect(html).toMatch(/<div[^>]*data-label="1:05"[^>]*data-live="none"[^>]*data-role="timer"/);
});

it("renders an identical live region as the timer advances, so nothing new is announced", () => {
  const first = live(render(activity("working")));
  clock.now += 7_000;
  const later = render(activity("working"));
  expect(live(later)).toEqual(first);
  expect(later).toContain('data-label="1:12"');
});

it("still announces meaningful status changes", () => {
  expect(live(render(activity("needs-input")))[0]).toContain('data-label="Needs your answer"');
  expect(live(render(activity("waiting", { waitingOn: { agents: 2, tasks: 0 } })))[0]).toContain('data-label="Waiting for 2 agents"');
  const done = render(activity("done"));
  expect(live(done)[0]).toContain('data-label="Done"');
  expect(done).not.toContain('data-role="timer"');
});
