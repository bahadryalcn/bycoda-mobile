// @vitest-environment happy-dom
import { act, createElement, useEffect, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SessionHeader } from "./session-header";
const geometry = vi.hoisted(() => ({ scale: 1, width: undefined as undefined | ((event: any) => void), actions: undefined as undefined | ((event: any) => void) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => undefined }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/ui/typography", () => ({
  Body: ({ children }: PropsWithChildren) =>
    createElement("span", null, children),
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ fontScale: geometry.scale }),
  Text: ({ children }: PropsWithChildren) =>
    createElement("span", null, children),
  View: ({ children, onLayout, style }: PropsWithChildren<any>) => {
    if (onLayout) { if (style.marginStart === "auto") geometry.actions = onLayout; else geometry.width = onLayout; }
    return createElement("div", null, children);
  },
}));
it("retains complete status/scope and the same action state across keyboard density changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"),
    root = createRoot(container);
  let mounts = 0;
  function Action() {
    useEffect(() => {
      mounts++;
    }, []);
    return createElement("input", { defaultValue: "Action draft" });
  }
  const render = (compact: boolean) =>
    root.render(
      createElement(
        SessionHeader,
        {
          compact,
          status: "Awaiting approval",
          context: "Computer · Project",
          statusColor: "red",
        },
        createElement(Action),
      ),
    );
  try {
    await act(async () => render(false));
    const input = container.querySelector("input")!;
    input.value = "Preserved action draft";
    for (const compact of [true, false, true]) {
      await act(async () => {
        geometry.width!({nativeEvent:{layout:{width:compact?288:635}}});
        geometry.actions!({nativeEvent:{layout:{width:230}}});
        geometry.scale = compact ? 2 : 1;
        render(compact);
      });
      expect(container.textContent?.match(/Awaiting approval/g)).toHaveLength(
        1,
      );
      expect(container.textContent?.match(/Computer · Project/g)).toHaveLength(
        1,
      );
      expect(container.querySelector("input")).toBe(input);
      expect(input.value).toBe("Preserved action draft");
    }
    expect(mounts).toBe(1);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
