// @vitest-environment happy-dom
import { act, createElement, useEffect, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SectionNavigator } from "./section-progress";

vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
vi.mock("react-native-reanimated", () => ({
  useAnimatedReaction: (prepare: () => number, react: (value: number, previous: null) => void) => {
    useEffect(() => { react(prepare(), null); }, []);
  },
}));
vi.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn: (value: number) => void, value: number) => fn(value),
}));
vi.mock("../i18n", () => ({ useLocale: () => "tr" }));
vi.mock("./layout", () => ({
  Stack: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
vi.mock("./screen-content-insets", () => ({ useScreenContentInsets: () => ({ left: 16, right: 16, bottom: 0 }) }));
vi.mock("./tokens", () => ({ metrics: { touchTarget: 48 }, space: { xs: 4, sm: 8 } }));
vi.mock("./typography", () => ({
  Body: ({ children }: PropsWithChildren) => createElement("p", null, children),
}));
vi.mock("./buttons", () => ({
  Button: ({ label, accessibilityLabel, onPress, style }: {
    label: string; accessibilityLabel: string; onPress: () => void; style: { minHeight: number };
  }) => createElement("button", { "aria-label": accessibilityLabel, onClick: onPress, style }, label),
  SelectRow: ({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) =>
    createElement("button", { "aria-pressed": selected, onClick: onPress }, label),
}));
vi.mock("./dialogs", () => ({
  Sheet: ({ title, visible, onClose, children }: PropsWithChildren<{
    title: string; visible: boolean; onClose: () => void;
  }>) => visible ? createElement("section", { "aria-label": title },
    children, createElement("button", { onClick: onClose }, "Dismiss")) : null,
}));

it("uses a 48 dp trigger, formats Turkish progress, and closes or jumps through the shared sheet", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const onSelect = vi.fn();
  const scroll = { offset: { value: 100 }, viewport: { value: 400 }, content: { value: 800 } };
  const percent = new Intl.NumberFormat("tr", { style: "percent" }).format(0.25);
  try {
    await act(async () => root.render(createElement(SectionNavigator, {
      sections: [{ id: "first", title: "Gizlilik" }, { id: "last", title: "İletişim" }],
      label: "Bölümler", active: "first", onSelect,
      scroll: scroll as Parameters<typeof SectionNavigator>[0]["scroll"],
    })));
    const trigger = container.querySelector("button")!;
    expect(trigger.style.minHeight).toBe("48px");
    expect(trigger.getAttribute("aria-label")).toBe(`Bölümler. Gizlilik. ${percent}`);
    expect(container.querySelector("p")?.textContent).toBe(`${percent} · Gizlilik`);
    await act(() => trigger.click());
    expect(container.querySelector('section[aria-label="Bölümler"] button[aria-pressed="true"]')?.textContent).toBe("Gizlilik");
    const dismiss = [...container.querySelectorAll<HTMLButtonElement>("section button")].find((item) => item.textContent === "Dismiss")!;
    await act(() => dismiss.click());
    expect(container.querySelector("section")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    await act(() => trigger.click());
    const contact = [...container.querySelectorAll("section button")].find((item) => item.textContent === "İletişim")!;
    await act(() => (contact as HTMLButtonElement).click());
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("last");
    expect(container.querySelector("section")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
