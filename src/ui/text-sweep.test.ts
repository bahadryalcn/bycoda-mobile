import { createElement as h, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const motion = vi.hoisted(() => ({ feedback: true, lead: true }));
vi.mock("panelui-native/components/shimmer", () => ({
  Shimmer: ({ children, enabled, spread, baseColor, shimmerColor }: PropsWithChildren<{ enabled: boolean; spread: number; baseColor: string; shimmerColor: string }>) =>
    h("div", { "data-enabled": String(enabled), "data-spread": String(spread), "data-base": baseColor, "data-ink": shimmerColor }, children),
}));
vi.mock("./animation-lead", () => ({ useAnimationLead: (wants: boolean) => wants && motion.lead }));
vi.mock("./use-feedback-animation", () => ({ useFeedbackAnimation: () => motion.feedback }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ colors: { muted: "muted", text: "ink" } }) }));
vi.mock("./typography", () => ({ Body: ({ children }: PropsWithChildren) => h("p", null, children) }));
import { SweepLabel, TextSweep, sweepRemaining, sweepWithinCap } from "./text-sweep";

beforeEach(() => {
  motion.feedback = true;
  motion.lead = true;
});

describe("text sweep", () => {
  it("caps a sweep from when the work started", () => {
    expect(sweepWithinCap(undefined, 10_000, 50_000)).toBe(true);
    expect(sweepWithinCap(45_000, 10_000, 50_000)).toBe(true);
    expect(sweepWithinCap(30_000, 10_000, 50_000)).toBe(false);
    expect(sweepRemaining(45_000, 10_000, 50_000)).toBe(5000);
    expect(sweepRemaining(30_000, 10_000, 50_000)).toBe(0);
    expect(sweepRemaining(undefined, 10_000, 50_000)).toBeUndefined();
  });
  it("sweeps muted text with full ink only while active, visible, allowed motion and holding the lead", () => {
    const render = (active = true) => renderToStaticMarkup(h(SweepLabel, { active, children: "Working 0:12" }));
    expect(render()).toContain('data-enabled="true"');
    expect(render()).toContain('data-base="muted"');
    expect(render()).toContain('data-ink="ink"');
    expect(render(false)).toContain('data-enabled="false"');
    motion.feedback = false;
    expect(render()).toContain('data-enabled="false"');
    motion.feedback = true;
    motion.lead = false;
    expect(render()).toContain('data-enabled="false"');
    expect(render()).toContain("Working 0:12");
  });
  it("stays still once its cap has passed", () => {
    const html = renderToStaticMarkup(h(TextSweep, { active: true, since: Date.now() - 20_000, capMs: 10_000, children: "Sent" }));
    expect(html).toContain('data-enabled="false"');
  });
});
