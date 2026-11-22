// @vitest-environment happy-dom
import { act, createElement as h, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ToggleField } from "./fields";

const haptic = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => h("div", null, children),
  Pressable: ({ children, accessibilityRole, accessibilityLabel, onPress, disabled, ...props }: PropsWithChildren<{
    accessibilityRole?: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean;
    "aria-checked"?: boolean;
  }>) => h("button", { role: accessibilityRole, "aria-label": accessibilityLabel, "aria-checked": props["aria-checked"], onClick: onPress, disabled }, children),
}));
vi.mock("panelui-native/components/switch", () => ({ Switch: ({ value }: { value: boolean }) => h("span", { "data-track": value }) }));
vi.mock("panelui-native/components/input", () => ({ Input: () => null }));
vi.mock("panelui-native/components/input-group", () => ({ InputGroup: () => null }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ uiStyles: {}, pressedFill: "" }) }));
vi.mock("./typography", () => ({ Body: ({ children }: PropsWithChildren) => h("span", null, children) }));
vi.mock("./feedback", () => ({ FieldError: () => null }));
vi.mock("./motion", () => ({ haptic }));
vi.mock("./navigation-row", () => ({ useInNavigationGroup: () => false }));
vi.mock("./info-hint", () => ({ InfoPanel: () => null }));

it("toggles from the visible track and label, with a single accessible switch", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const changed = vi.fn();
  const Form = ({ disabled }: { disabled?: boolean }) => {
    const [value, setValue] = useState(false);
    return h(ToggleField, { label: "Archived sessions", value, disabled, onChange: (next: boolean) => {
      changed(next);
      setValue(next);
    } });
  };
  try {
    await act(async () => root.render(h(Form)));
    expect(container.querySelectorAll('[role="switch"]')).toHaveLength(1);
    const track = () => container.querySelector<HTMLButtonElement>("[data-track]")?.closest("button");
    expect(track()).not.toBeNull();
    await act(async () => track()!.click());
    expect(container.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("true");
    await act(async () => container.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
    expect(changed.mock.calls).toEqual([[true], [false]]);
    expect(haptic.select).toHaveBeenCalledTimes(2);
    await act(async () => root.render(h(Form, { disabled: true })));
    await act(async () => track()!.click());
    expect(changed).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
