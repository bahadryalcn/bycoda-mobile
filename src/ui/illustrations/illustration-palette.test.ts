// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { applyMobileTheme, resolveMobilePalette } from "../tokens";
vi.mock("../styles", () => ({ uiStyles: {} }));
vi.mock("react-native-svg", () => ({
  default: ({ children }: { children?: React.ReactNode }) => createElement("svg", null, children),
  Circle: ({ fill }: { fill: string }) => createElement("circle", { fill }),
  G: ({ children }: { children?: React.ReactNode }) => createElement("g", null, children),
  Rect: () => null, Path: () => null,
}));
// Model the compiler's existing props-only cache, keeping the real art and theme owners.
vi.mock("./art/connect-computer", async importOriginal => {
  const original = await importOriginal<typeof import("./art/connect-computer")>();
  const { memo } = await import("react");
  return { default: memo(original.default) };
});
import { Illustration } from "./index";
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => { act(() => root?.unmount()); root = undefined; applyMobileTheme("dark", "classic"); vi.unstubAllGlobals(); });
it("invalidates cached decorative art when palette changes without a mode or size change", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  applyMobileTheme("light", "classic");
  const container = document.createElement("div"); root = createRoot(container);
  act(() => root!.render(createElement(Illustration, { name: "connect-computer" })));
  for (const palette of ["classic", "bycoda", "olive", "tide", "kiln", "dusk", "ink"] as const) {
    act(() => applyMobileTheme("light", palette));
    expect(container.querySelector("circle")?.getAttribute("fill")).toBe(resolveMobilePalette(palette, "light").colors.raised);
  }
});
