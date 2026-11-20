import { createElement, type ComponentProps, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PressableTextContext, selectableByDefault } from "./text-selection";
import { Body, CodeText, Heading } from "./typography";

vi.mock("react-native", () => ({ StyleSheet: { flatten: () => ({}) } }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ uiStyles: {} }) }));
vi.mock("./design-system", () => ({ bodyClasses: "" }));
vi.mock("panelui-native/components/typography", () => {
  const Text = ({ children, selectable }: PropsWithChildren<{ selectable?: boolean }>) =>
    createElement("span", { "data-selectable": String(selectable) }, children);
  return { Typography: Object.assign(Text, { Heading: Text }) };
});

it("keeps line-limited text non-selectable so Android truncates it instead of wrapping", () => {
  expect(selectableByDefault(1)).toBe(false);
  expect(selectableByDefault(2)).toBe(false);
  expect(selectableByDefault(undefined)).toBe(true);
  expect(selectableByDefault(0)).toBe(true);
});

it.each([Body, Heading, CodeText])("defaults to nonselectable in pressable cards and preserves reader opt-ins", (Text) => {
  const text = (props: ComponentProps<typeof Text>) => createElement(Text, props, "Label");
  expect(renderToStaticMarkup(text({}))).toContain('data-selectable="true"');
  expect(renderToStaticMarkup(createElement(PressableTextContext, { value: true }, text({})))).toContain('data-selectable="false"');
  expect(renderToStaticMarkup(createElement(PressableTextContext, { value: true }, text({ selectable: true })))).toContain('data-selectable="true"');
});
