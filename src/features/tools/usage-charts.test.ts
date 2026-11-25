import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { ProviderUsage } from "./usage-breakdown";

vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
vi.mock("@/ui/primitives", () => ({
  Body: ({ children }: PropsWithChildren) => createElement("p", null, children),
}));
vi.mock("@/ui/metric-value", () => ({ MetricValue: ({ children }: PropsWithChildren) => createElement("p", null, children) }));
vi.mock("@/ui/metric-row", () => ({
  MetricRow: ({ label, value }: { label: string; value: string }) =>
    createElement("p", null, `${label}: ${value}`),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("panelui-native/components/badge", () => ({ Badge: () => null }));
vi.mock("panelui-native/components/bar-chart", () => ({ BarChart: () => null }));
vi.mock("panelui-native/components/kpi", () => ({ Kpi: () => null }));
vi.mock("panelui-native/components/pie-chart", () => ({
  PieChart: () => createElement("div", { "data-pie": true }),
}));
import { ProviderShare } from "./usage-charts";

it("distinguishes known zero tokens from an unavailable reading and draws no zero-total donut", () => {
  const html = renderToStaticMarkup(
    createElement(ProviderShare, {
      rows: [
        { provider: "Claude", tokens: 0 },
        { provider: "Codex", tokens: 0 },
        { provider: "Unknown", tokens: null },
      ] as ProviderUsage[],
    }),
  );
  expect(html).toContain("Claude: 0");
  expect(html).toContain("Codex: 0");
  expect(html).toContain("Unknown: —");
  expect(html).not.toContain("data-pie");
});
