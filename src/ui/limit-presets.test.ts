import { createElement as h, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/ui/copy", () => ({
  useCopy: () => (_tr: string, en: string, values?: Record<string, string>) => en.replace("{p0}", values?.p0 ?? ""),
}));
vi.mock("@/ui/integer-stepper", () => ({
  IntegerStepper: ({ value }: { value: number }) => h("output", null, value),
  stepperValue: (text: string, min: number) => Number(text) || min,
}));
vi.mock("@/ui/primitives", () => ({
  Stack: ({ children }: PropsWithChildren) => h("div", null, children),
  ErrorText: ({ error }: { error: string }) => h("p", { role: "alert" }, error),
  NumberField: ({ label, value }: { label: string; value: string }) => h("input", { "aria-label": label, value, readOnly: true }),
  SelectField: ({ value, placeholder, options }: { value?: string; placeholder?: string; options: { value: string; label: string }[] }) =>
    h("select", { "data-value": value, "data-placeholder": placeholder }, options.map((option) => h("option", { key: option.value }, option.label))),
}));

import { IntegerTextStepper, LimitPresets, MinuteLimitField } from "./limit-presets";

const base = { label: "Limit", customLabel: "Custom", values: ["0", "5"], format: (value: string) => `v${value}`, onChange: () => undefined };

it("keeps the keyboard closed for a preset and names an existing value outside the presets", () => {
  expect(renderToStaticMarkup(h(LimitPresets, { ...base, value: "5" }))).not.toContain("<input");
  expect(renderToStaticMarkup(h(LimitPresets, { ...base, value: "7" }))).toContain('data-placeholder="v7"');
});

it("opens the custom field for an invalid draft without formatting it as a choice", () => {
  const owned = renderToStaticMarkup(h(LimitPresets, { ...base, value: "abc", invalid: true }));
  expect(owned).toContain('value="abc"');
  expect(owned).not.toContain("vabc");
  const shown = renderToStaticMarkup(h(LimitPresets, { ...base, value: "abc", error: "Enter a number" }));
  expect(shown).toContain('data-value="custom"');
});

it("offers unlimited only when zero is allowed", () => {
  expect(renderToStaticMarkup(h(MinuteLimitField, { label: "Run", value: "60", onChange: () => undefined }))).toContain("Unlimited");
  expect(renderToStaticMarkup(h(MinuteLimitField, { label: "Gap", min: 1, value: "60", onChange: () => undefined }))).not.toContain("Unlimited");
});

it("shows a stepper error beside the control", () => {
  const html = renderToStaticMarkup(h(IntegerTextStepper, { label: "Repeats", value: "99", min: 0, max: 10, onChangeText: () => undefined, error: "Out of range" }));
  expect(html).toContain("Out of range");
});
