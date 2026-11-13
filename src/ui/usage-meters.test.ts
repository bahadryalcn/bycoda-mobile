import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("panelui-native/components/bar-chart", () => ({ BarChart: () => null }));
vi.mock("panelui-native/components/kpi", () => ({ Kpi: () => null }));
vi.mock("panelui-native/components/meter", () => ({ Meter: ({ value, accessibilityLabel, label }: { value: number; accessibilityLabel?: string; label?: string }) => createElement("div", { role: "progressbar", "aria-label": accessibilityLabel ?? label, "aria-valuenow": value }, label) }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
import { AccountMeter, RemainingMeter } from "./usage-meters";
it("retains named remaining-quota values without repeating the consumer's visible captions", () => {
  const html = renderToStaticMarkup(createElement("div", null,
    createElement(RemainingMeter, { left: 25, timeLeft: null, label: "Weekly left" }),
    createElement(AccountMeter, { left: 0, label: "Research account left" })));
  expect(html).toContain('aria-label="Weekly left" aria-valuenow="25"');
  expect(html).toContain('aria-label="Research account left" aria-valuenow="0"');
  expect(html.replace(/<[^>]+>/g, "")).toBe("");
});
