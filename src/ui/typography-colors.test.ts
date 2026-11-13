// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Body } from "./typography";
import { useMobileTheme } from "./theme";
import { applyMobileTheme, themePalettes } from "./tokens";
vi.mock("react-native", () => ({ StyleSheet: { hairlineWidth: 1, flatten: (styles: unknown[]) => Object.assign({}, ...styles.flat(Infinity).filter(Boolean)) } }));
vi.mock("./design-system", () => ({ bodyClasses: "text-base text-foreground" }));
vi.mock("panelui-native/components/typography", () => ({ Typography: ({ children, style }: PropsWithChildren<{ style: { color: string } }>) => h("span", { "data-color": style.color }, children) }));
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => { act(() => root?.unmount()); applyMobileTheme("dark", "classic"); vi.unstubAllGlobals(); });
function Probe() {
  const { uiStyles } = useMobileTheme();
  return h("div", null, h(Body, null, "Title"), h(Body, { muted: true }, "Secondary"), h(Body, { muted: true, style: uiStyles.caption }, "Metadata"));
}
it("keeps metadata distinct from primary text across live light and dark theme changes", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); root = createRoot(container);
  act(() => root!.render(h(Probe)));
  for (const mode of ["light", "dark"] as const) {
    act(() => applyMobileTheme(mode, "classic"));
    const values = [...container.querySelectorAll("span")].map(node => node.getAttribute("data-color"));
    expect(values).toEqual([themePalettes[mode].text, themePalettes[mode].muted, themePalettes[mode].muted]);
    expect(values[0]).not.toBe(values[1]);
  }
});
