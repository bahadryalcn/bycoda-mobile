// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyMobileTheme, colors, semanticColors } from "../tokens";

vi.mock("../styles", () => ({ uiStyles: {} }));
vi.mock("react-native-svg", () => {
  const shape = (tag: string) => ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) =>
    createElement(tag, props, children);
  return {
    default: ({ children, testID, accessibilityElementsHidden, importantForAccessibility, accessible, ...props }:
      PropsWithChildren<Record<string, unknown>>) => createElement("svg", {
        ...props, "data-testid": testID,
        "data-hidden": String(accessibilityElementsHidden),
        "data-accessible": String(accessible),
        "data-importance": importantForAccessibility,
      }, children),
    G: shape("g"), Circle: shape("circle"), Rect: shape("rect"), Path: shape("path"),
  };
});

import { Illustration, illustrationNames } from "./index";

afterEach(() => applyMobileTheme("dark"));

describe("state illustration family", () => {
  for (const mode of ["light", "dark"] as const) {
    it.each(illustrationNames)(`renders %s with ${mode} tokens and decorative semantics`, (name) => {
      applyMobileTheme(mode);
      const html = renderToStaticMarkup(createElement(Illustration, { name }));
      const holder = document.createElement("div");
      holder.innerHTML = html;
      const svg = holder.querySelector("svg")!;
      expect(svg.getAttribute("viewBox")).toBe("0 0 120 120");
      expect(svg.getAttribute("width")).toBe("120");
      expect(svg.getAttribute("data-testid")).toBe(`illustration-${name}`);
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("data-hidden")).toBe("true");
      expect(svg.getAttribute("data-accessible")).toBe("false");
      expect(svg.getAttribute("data-importance")).toBe("no-hide-descendants");
      expect(svg.querySelectorAll("path, rect").length).toBeGreaterThan(0);
      expect(html).toContain(colors.raised);
      const highlight = name === "error" ? semanticColors.danger.text
        : name === "success" ? semanticColors.success.text
        : name === "locked" ? semanticColors.warning.text : colors.accent;
      expect(html).toContain(highlight);
      expect(svg.textContent).toBe("");
    });
  }

  it("gives all twelve names distinct art", () => {
    expect(illustrationNames).toHaveLength(12);
    const art = illustrationNames.map((name) => {
      const holder = document.createElement("div");
      holder.innerHTML = renderToStaticMarkup(createElement(Illustration, { name }));
      return holder.querySelector("g")!.innerHTML;
    });
    expect(new Set(art).size).toBe(12);
  });

  it("updates mounted art and semantic strokes when the palette changes", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const holder = document.createElement("div");
    const root = createRoot(holder);
    try {
      await act(async () => root.render(createElement(Illustration, { name: "error", size: 96 })));
      const before = holder.innerHTML;
      await act(async () => applyMobileTheme("light"));
      expect(holder.innerHTML).not.toBe(before);
      expect(holder.innerHTML).toContain(colors.raised);
      expect(holder.innerHTML).toContain(semanticColors.danger.text);
      expect(holder.querySelector("svg")!.getAttribute("width")).toBe("96");
      expect(holder.querySelector("svg")!.getAttribute("height")).toBe("96");
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});
