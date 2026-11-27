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
vi.mock("@/ui/chat-activity", () => ({ ChatStreaming: ({ label }: { label: string }) => h("p", null, label) }));
vi.mock("lucide-react-native/icons/globe", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/smartphone", () => ({ default: () => null }));
vi.mock("@/ui/typography", () => ({ Body: ({ children }: PropsWithChildren) => h("p", null, children) }));
vi.mock("@/ui/primitives", () => ({ PressableCard: ({ children }: PropsWithChildren) => h("button", null, children) }));
vi.mock("@/ui/copy", () => ({
  useCopy: () => (_tr: string, en: string, values?: { p0?: number }) =>
    values?.p0 === undefined ? en : en.replace("{p0}", String(values.p0)),
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: { raised: "r", separator: "s", warning: "w", success: "ok", tertiary: "t", info: "i" } }) }));
vi.mock("@/ui/tokens", () => ({ fontSize: {}, hitSlopFor: () => 8, lineHeight: {}, metrics: { touchTarget: 44 }, radii: {}, space: {} }));
vi.mock("./use-elapsed-now", () => ({ useElapsedNow: () => clock.now }));
import { SessionActivityBar } from "./session-activity-bar";

const START = 1_000_000;
const activity = (state: string, extra: object = {}) =>
  ({ state, startedAt: START, counts: { total: 0, queued: 0, running: 0, done: 0, failed: 0, stopped: 0, interrupted: 0 }, waitingOn: { agents: 0, tasks: 0 }, ...extra }) as never;
const render = (a: unknown) => renderToStaticMarkup(h(SessionActivityBar, { activity: a as never, onDevice: () => {}, onBrowser: () => {} }));
const live = (html: string) => [...html.matchAll(/<div[^>]*data-live="polite"[^>]*>/g)].map((match) => match[0]);
beforeEach(() => { clock.now = START + 65_000; });

it("leaves plain working and its clock to the transcript's live row, and subagents to the transcript pill", () => {
  expect(render(activity("working"))).toBe("");
  // Subagents show once, in the transcript's rows and floating pill, never as a strip segment.
  expect(render(activity("working", { counts: { total: 2, queued: 0, running: 2, done: 0, failed: 0, stopped: 0, interrupted: 0 } }))).toBe("");
  const withBrowser = renderToStaticMarkup(h(SessionActivityBar, { activity: activity("working"), browser: { host: "localhost" }, onDevice: () => {}, onBrowser: () => {} }));
  expect(live(withBrowser)).toHaveLength(0);
  expect(withBrowser).not.toContain("Working");
  expect(withBrowser).not.toContain("1:05");
  expect(withBrowser).toContain("localhost");
});

it("never shows a ticking timer, so nothing re-renders or is announced each second", () => {
  const waiting = activity("waiting", { waitingOn: { agents: 1, tasks: 0 } });
  const first = render(waiting);
  clock.now += 7_000;
  expect(render(waiting)).toEqual(first);
  expect(first).not.toContain('data-role="timer"');
  expect(first).not.toContain("1:05");
});

it("still announces meaningful status changes", () => {
  expect(live(render(activity("needs-input")))[0]).toContain('data-label="Needs you"');
  expect(live(render(activity("waiting", { waitingOn: { agents: 2, tasks: 0 } })))[0]).toContain('data-label="Waiting for 2 agents"');
  const done = render(activity("done"));
  expect(live(done)[0]).toContain('data-label="Done"');
  expect(done).not.toContain('data-role="timer"');
});

it("leaves the run state to the session's floating status cluster when it owns it", () => {
  const props = { activity: activity("needs-input"), onDevice: () => {}, onBrowser: () => {}, showState: false };
  expect(renderToStaticMarkup(h(SessionActivityBar, props))).toBe("");
  const withDevice = renderToStaticMarkup(h(SessionActivityBar, { ...props, device: { name: "Pixel" } }));
  expect(withDevice).toContain("Pixel");
  expect(withDevice).not.toContain("Needs you");
});
