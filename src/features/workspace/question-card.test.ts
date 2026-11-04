// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QuestionCard } from "./question-card";
import { questionCardStates } from "./question-card-state";
import type { QuestionCardProps } from "./session-types";

const state = vi.hoisted(() => ({ fields: new Map<string, (value: string) => void>(), singles: new Set<string>(), multis: new Set<string>() }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => undefined }));
vi.mock("@/ui/tokens", () => ({ colors: { panel: "panel" } }));
vi.mock("./shared", () => ({ workspaceStyles: { stack: {} } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const choice = (multi: boolean) => ({ label, disabled, options }: { label: string; disabled?: boolean; options: { value: string }[] }) => {
    (multi ? state.multis : state.singles).add(label);
    return createElement("select", { "aria-label": label, disabled, multiple: multi }, options.map((option) => createElement("option", { key: option.value }, option.value)));
  };
  return { Body: Wrapper, Card: Wrapper, Row: Wrapper, Disclosure: Wrapper,
    Badge: ({ label }: { label: string }) => createElement("span", null, label),
    SelectField: choice(false), MultiSelectField: choice(true),
    Field: ({ label, value, editable, onChangeText }: { label: string; value: string; editable?: boolean; onChangeText: (value: string) => void }) => {
      state.fields.set(label, onChangeText);
      return createElement("textarea", { "aria-label": label, value, disabled: editable === false, readOnly: true });
    },
    Button: ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => createElement("button", { disabled, onClick: onPress }, label),
  };
});

const prompt = "Describe the recovery steps";
const question = (multiSelect = false): QuestionCardProps["question"] => ({ requestId: 10, callId: "call", questions: [
  { id: "response", prompt, allowCustom: true, multiSelect, options: [] },
] });
let root: ReturnType<typeof createRoot>;
const container = document.createElement("div");
const scope = "question-presentation-test";
let props: QuestionCardProps;
async function render(update: Partial<QuestionCardProps> = {}) {
  props = { ...props, ...update };
  state.singles.clear(); state.multis.clear(); state.fields.clear();
  await act(async () => root.render(createElement(QuestionCard, props)));
}
const send = () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Send answer")!;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); props = { question: question(), draftScope: scope, deliveryVersion: 1, disabled: false, onAnswer: vi.fn() }; root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); questionCardStates.retain(scope, []); vi.unstubAllGlobals(); });

it.each([false, true])("uses one prompt-labelled text field for a choice-free custom question (multi=%s)", async (multiSelect) => {
  await render({ question: question(multiSelect) });
  expect(container.querySelector("select")).toBeNull();
  expect(container.querySelector("textarea")?.getAttribute("aria-label")).toBe(prompt);
  expect(send().disabled).toBe(true);
});

it.each([false, true])("keeps real choice controls and their custom-answer label (multi=%s)", async (multiSelect) => {
  const value = question(multiSelect); value.questions[0].options = [{ id: "a", label: "Choice A" }];
  await render({ question: value });
  expect((multiSelect ? state.multis : state.singles).has(prompt)).toBe(true);
  expect(container.querySelector("select")?.querySelectorAll("option")).toHaveLength(1);
  expect(state.fields.has("Your own answer")).toBe(true);
});

it.each([false, true])("preserves the existing custom-answer normalization and send latch (whitespace=%s)", async (preserveCustomWhitespace) => {
  const value = question(); value.questions[0].preserveCustomWhitespace = preserveCustomWhitespace;
  await render({ question: value });
  await act(async () => state.fields.get(prompt)!("  keep these steps  "));
  expect(send().disabled).toBe(false);
  await act(async () => { send().click(); send().click(); });
  expect(props.onAnswer).toHaveBeenCalledTimes(1);
  expect(props.onAnswer).toHaveBeenCalledWith({ kind: "answered", answers: {}, custom: { response: preserveCustomWhitespace ? "  keep these steps  " : "keep these steps" } });
  expect(send().disabled).toBe(true);
});

it.each(["sending", "queued", "unknown"] as const)("keeps held delivery disabled and visible: %s", async (delivery) => {
  await render({ question: { ...question(), delivery } });
  expect(container.querySelector("textarea")?.disabled).toBe(true);
  expect(send().disabled).toBe(true);
  expect(container.querySelector("select")).toBeNull();
  expect(props.onAnswer).not.toHaveBeenCalled();
});

it("retains the real draft and uncertain delivery across remount without resending", async () => {
  await render({ onAnswer: vi.fn().mockRejectedValue(new Error("Uncertain transport")) });
  await act(async () => state.fields.get(prompt)!("Preserved recovery draft"));
  await act(async () => send().click());
  expect(container.textContent).toContain("Answer delivery not confirmed");
  await act(async () => root.unmount()); root = createRoot(container); await render();
  expect(container.querySelector("textarea")?.value).toBe("Preserved recovery draft");
  expect(send().disabled).toBe(true); expect(props.onAnswer).toHaveBeenCalledTimes(1);
});

it("keeps external permission disabling and malformed choice-only prompts unchanged", async () => {
  await render({ disabled: true });
  expect(container.querySelector("textarea")?.disabled).toBe(true); expect(send().disabled).toBe(true);
  const value = question(); value.questions[0].allowCustom = false; await render({ disabled: false, question: value });
  expect(container.querySelector("select")?.getAttribute("aria-label")).toBe(prompt);
  expect(container.querySelector("textarea")).toBeNull(); expect(send().disabled).toBe(true);
});
