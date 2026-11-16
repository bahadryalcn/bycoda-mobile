import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native-svg", () => ({
  default: ({ children, width, height, viewBox }: { children?: ReactNode; width?: number; height?: number; viewBox?: string }) =>
    createElement("svg", { width, height, viewBox }, children),
  G: "g",
  Path: "path",
}));

import { decorativeSvgProps } from "./accessibility";
import { DuotoneIcon, duotoneIconMap, type DuotoneIconName } from "./duotone-icon";
import { PALETTE_IDS, resolveMobilePalette } from "./tokens";

const names = Object.keys(duotoneIconMap) as DuotoneIconName[];

describe("duotone identity icons", () => {
  it.each(names)("renders %s with one translucent plane and one opaque front", (name) => {
    for (const size of [20, 24, 32]) {
      const svg = renderToStaticMarkup(createElement(DuotoneIcon, { name, size, color: "currentColor" }));
      expect(svg).toContain(`width="${size}"`);
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg.match(/opacity="0.35"/g)).toHaveLength(1);
      expect(svg).toContain(`d="${duotoneIconMap[name].back}" fill="currentColor"`);
      expect(svg).toContain('fill="none" stroke="currentColor" stroke-width="2"');
      expect(svg).toContain(`d="${duotoneIconMap[name].front}"`);
      expect(duotoneIconMap[name].back).not.toBe(duotoneIconMap[name].front);
    }
  });

  it.each(PALETTE_IDS)("propagates caller tint in both %s appearances", (palette) => {
    for (const mode of ["dark", "light"] as const) {
      const { colors } = resolveMobilePalette(palette, mode);
      for (const name of names) {
        for (const color of [colors.muted, colors.accent]) {
          const svg = renderToStaticMarkup(createElement(DuotoneIcon, { name, color }));
          expect(svg).toContain(`fill="${color}" opacity="0.35"`);
          expect(svg).toContain(`stroke="${color}"`);
        }
      }
    }
  });

  it("retains decorative accessibility and caller sizing/style", () => {
    const style = { marginTop: 1 };
    const tree = DuotoneIcon({ name: "laptop", size: 32, color: "currentColor", style, strokeWidth: 1.8 });
    expect(tree.props).toMatchObject({ ...decorativeSvgProps, width: 32, height: 32, style });
    const front = Children.toArray(tree.props.children)[1];
    expect(isValidElement(front) && front.props).toMatchObject({ strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" });
  });

  it("omits the back plane below 20dp", () => {
    for (const name of names) {
      const svg = renderToStaticMarkup(createElement(DuotoneIcon, { name, size: 18 }));
      expect(svg).not.toContain("opacity=");
      expect(svg).toContain(`d="${duotoneIconMap[name].front}"`);
    }
  });
});
