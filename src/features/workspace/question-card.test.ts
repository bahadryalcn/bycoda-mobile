// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QuestionCard } from "./question-card";
import { questionCardStates } from "./question-card-state";
import type { QuestionCardProps } from "./session-types";
import { RemoteHostError } from "@/remote/host-error";

const state = vi.hoisted(() => ({
  fields: new Map<string, (value: string) => void>(),
  choices: new Set<string>(),
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: { panel: "panel" }, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/tokens", () => ({ colors: { panel: "panel" }, space: { xs: 4 } }));
vi.mock("./shared", () => ({ workspaceStyles: { stack: {} } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("panelui-native/components/questionnaire", async () => {
  const React = await import("react");
  type Ctx = {
    answers: Record<string, string | string[]>;
    set: (name: string, value: string | string[]) => void;
  };
  const Root = React.createContext<Ctx>({ answers: {}, set: () => {} });
  const ItemCtx = React.createContext({ name: "", multiple: false });
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Questionnaire = Object.assign(
    ({
      answers,
      onAnswersChange,
      children,
    }: PropsWithChildren<{
      answers: Record<string, string | string[]>;
      onAnswersChange: (next: Record<string, string | string[]>) => void;
    }>) =>
      createElement(
        Root.Provider,
        { value: { answers, set: (name, value) => onAnswersChange({ ...answers, [name]: value }) } },
        children,
      ),
    {
      Progress: () => createElement("span", null, "progress"),
      Item: ({ name, multiple, children }: PropsWithChildren<{ name: string; multiple: boolean }>) =>
        createElement(ItemCtx.Provider, { value: { name, multiple } }, children),
      Question: Wrap,
      Choices: Wrap,
      Choice: ({ value, label, disabled }: { value: string; label: string; disabled?: boolean }) => {
        const root = React.useContext(Root);
        const item = React.useContext(ItemCtx);
        state.choices.add(`${item.multiple ? "multi" : "single"}:${label}`);
        return createElement(
          "button",
          {
            "data-choice": value,
            disabled,
            onClick: () => root.set(item.name, item.multiple ? [value] : value),
          },
          label,
        );
      },
      Footer: Wrap,
      Spacer: () => null,
      Back: () => null,
      Next: () => null,
      Submit: ({
        children,
        disabled,
        onPress,
      }: PropsWithChildren<{ disabled?: boolean; onPress: () => void }>) =>
        createElement("button", { disabled, onClick: onPress }, children),
    },
  );
  return { Questionnaire };
});
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Body: Wrapper,
    ErrorText: ({ error }: { error: unknown }) => error ? createElement("p", null, String(error)) : null,
    Card: Wrapper,
    Row: Wrapper,
    Disclosure: Wrapper,
    Badge: ({ label }: { label: string }) => createElement("span", null, label),
    Field: ({
      label,
      value,
      editable,
      onChangeText,
    }: {
      label: string;
      value: string;
      editable?: boolean;
      onChangeText: (value: string) => void;
    }) => {
      state.fields.set(label, onChangeText);
      return createElement("textarea", {
        "aria-label": label,
        value,
        disabled: editable === false,
        readOnly: true,
      });
    },
    Button: ({
      label,
      disabled,
      onPress,
    }: {
      label: string;
      disabled?: boolean;
      onPress: () => void;
    }) => createElement("button", { disabled, onClick: onPress }, label),
  };
});

const prompt = "Describe the recovery steps";
const question = (multiSelect = false): QuestionCardProps["question"] => ({
  requestId: 10,
  callId: "call",
  questions: [{ id: "response", prompt, allowCustom: true, multiSelect, options: [] }],
});
let root: ReturnType<typeof createRoot>;
const container = document.createElement("div");
const scope = "question-presentation-test";
let props: QuestionCardProps;
async function render(update: Partial<QuestionCardProps> = {}) {
  props = { ...props, ...update };
  state.choices.clear();
  state.fields.clear();
  await act(async () => root.render(createElement(QuestionCard, props)));
}
const pick = (id: string) => container.querySelector<HTMLButtonElement>(`[data-choice="${id}"]`)!;
const send = () =>
  [...container.querySelectorAll("button")].find((button) => button.textContent === "Send answer")!;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  props = {
    question: question(),
    draftScope: scope,
    deliveryVersion: 1,
    disabled: false,
    onAnswer: vi.fn(),
  };
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  questionCardStates.retain(scope, []);
  vi.unstubAllGlobals();
});

it.each([false, true])(
  "uses one prompt-labelled text field for a choice-free custom question (multi=%s)",
  async (multiSelect) => {
    await render({ question: question(multiSelect) });
    expect(container.querySelector("[data-choice]")).toBeNull();
    expect(container.querySelector("textarea")?.getAttribute("aria-label")).toBe("Your answer");
    expect(send().disabled).toBe(true);
  },
);

it.each([false, true])(
  "keeps real choice controls and their custom-answer label (multi=%s)",
  async (multiSelect) => {
    const value = question(multiSelect);
    value.questions[0].options = [{ id: "a", label: "Choice A" }];
    await render({ question: value });
    expect(state.choices.has(`${multiSelect ? "multi" : "single"}:Choice A`)).toBe(true);
    expect(container.querySelectorAll("[data-choice]")).toHaveLength(1);
    expect(state.fields.has("Your own answer")).toBe(true);
  },
);

it.each([false, true])(
  "preserves the existing custom-answer normalization and send latch (whitespace=%s)",
  async (preserveCustomWhitespace) => {
    const value = question();
    value.questions[0].preserveCustomWhitespace = preserveCustomWhitespace;
    await render({ question: value });
    await act(async () => state.fields.get("Your answer")!("  keep these steps  "));
    expect(send().disabled).toBe(false);
    await act(async () => {
      send().click();
      send().click();
    });
    expect(props.onAnswer).toHaveBeenCalledTimes(1);
    expect(props.onAnswer).toHaveBeenCalledWith({
      kind: "answered",
      answers: {},
      custom: { response: preserveCustomWhitespace ? "  keep these steps  " : "keep these steps" },
    });
    expect(send().disabled).toBe(true);
  },
);

it.each(["sending", "queued", "unknown"] as const)(
  "keeps held delivery disabled and visible: %s",
  async (delivery) => {
    await render({ question: { ...question(), delivery } });
    expect(container.querySelector("textarea")?.disabled).toBe(true);
    expect(send().disabled).toBe(true);
    expect(container.querySelector("[data-choice]")).toBeNull();
    expect(props.onAnswer).not.toHaveBeenCalled();
  },
);

it("retains the real draft and uncertain delivery across remount without resending", async () => {
  await render({ onAnswer: vi.fn().mockRejectedValue(new Error("Uncertain transport")) });
  await act(async () => state.fields.get("Your answer")!("Preserved recovery draft"));
  await act(async () => send().click());
  expect(container.textContent).toContain("Answer delivery not confirmed");
  await act(async () => root.unmount());
  root = createRoot(container);
  await render();
  expect(container.querySelector("textarea")?.value).toBe("Preserved recovery draft");
  expect(send().disabled).toBe(true);
  expect(props.onAnswer).toHaveBeenCalledTimes(1);
});

it("keeps external permission disabling and malformed choice-only prompts unchanged", async () => {
  await render({ disabled: true });
  expect(container.querySelector("textarea")?.disabled).toBe(true);
  expect(send().disabled).toBe(true);
  const value = question();
  value.questions[0].allowCustom = false;
  await render({ disabled: false, question: value });
  expect(container.querySelector("textarea")).toBeNull();
  expect(send().disabled).toBe(true);
});

it.each([false, true])(
  "keeps choice IDs and optional notes through remount and submission (multi=%s)",
  async (multiSelect) => {
    const value = question(multiSelect);
    value.questions[0].options = [{ id: "a", label: "Choice A" }];
    await render({ question: value });
        await act(async () => pick("a").click());
    await act(async () =>
      state.fields.get("Additional note (optional)")!("  Keep this constraint  "),
    );
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    expect(
      container
        .querySelector('[aria-label="Additional note (optional)"]')
        ?.getAttribute("disabled"),
    ).toBeNull();
    expect(
      (container.querySelector('[aria-label="Additional note (optional)"]') as HTMLTextAreaElement)
        .value,
    ).toBe("  Keep this constraint  ");
    await act(async () => send().click());
    expect(props.onAnswer).toHaveBeenCalledWith({
      kind: "answered",
      answers: { response: ["a"] },
      custom: {},
      notes: { response: "Keep this constraint" },
    });
  },
);

it.each(["fixed", "typed"])("omits note controls for %s questions", async (kind) => {
  const value = question();
  value.questions[0].options = [{ id: "a", label: "Choice A" }];
  if (kind === "fixed") value.questions[0].allowCustom = false;
  else value.questions[0].preserveCustomWhitespace = true;
  await render({ question: value });
    await act(async () => pick("a").click());
  expect(state.fields.has("Additional note (optional)")).toBe(false);
});

it.each([false, true])(
  "recognizes a stable Other option ID while preserving literal choices (literal=%s)",
  async (literal) => {
    const value = question();
    value.questions[0].options = [
      { id: "a", label: "A" },
      { id: "provider-other", label: " Other ", literal },
    ];
    await render({ question: value });
        await act(async () => pick("a").click());
    await act(async () => state.fields.get("Additional note (optional)")!("Existing note"));
    await act(async () => pick("provider-other").click());
    expect(container.querySelector('[aria-label="Additional note (optional)"]') !== null).toBe(literal);
    if (!literal) {
      expect(send().disabled).toBe(true);
      await act(async () => state.fields.get("Your own answer")!("Use a separate release branch"));
    }
    await act(async () => send().click());
    expect(props.onAnswer).toHaveBeenCalledWith({
      kind: "answered",
      answers: { response: ["provider-other"] },
      custom: literal ? {} : { response: "Use a separate release branch" },
      ...(literal ? { notes: { response: "Existing note" } } : {}),
    });
  },
);

it("replaces a single fixed selection when typing a custom answer", async () => {
  const value = question();
  value.questions[0].options = [{ id: "a", label: "Choice A" }];
  await render({ question: value });
  await act(async () => pick("a").click());
  await act(async () => state.fields.get("Your own answer")!("Keep the original folder"));
  await act(async () => send().click());
  expect(props.onAnswer).toHaveBeenCalledWith({
    kind: "answered", answers: { response: ["__custom__"] }, custom: { response: "Keep the original folder" },
  });
});

it("does not leak a draft or uncertain latch to a new occurrence without remounting the parent", async () => {
  await render({ question: { ...question(), occurrenceId: "first" }, onAnswer: vi.fn().mockRejectedValue(new Error("Unknown result")) });
  await act(async () => state.fields.get("Your answer")!("First occurrence draft"));
  await act(async () => send().click());
  await render({ question: { ...question(), occurrenceId: "second" } });
  expect(container.querySelector("textarea")?.value).toBe("");
  expect(container.querySelector("textarea")?.disabled).toBe(false);
  expect(container.textContent).not.toContain("Answer delivery not confirmed");
});

it("submits attachment-only answers through the captured owner and strips local custody fields", async () => {
  const file = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", claimId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "proof.png", size: 4, mimeType: "image/png", kind: "image" as const, uri: "file:///private/proof" };
  const submitAnswer = vi.fn(async () => {});
  await render({ attachments: { response: [file] }, submitAnswer });
  expect(send().disabled).toBe(false);
  await act(async () => send().click());
  expect(submitAnswer).toHaveBeenCalledWith({ kind: "answered", answers: {}, custom: {}, attachments: { response: [{ id: file.id, name: file.name, size: 4, mimeType: file.mimeType, kind: file.kind }] } }, expect.objectContaining({ attachments: { response: [file] } }));
  expect(props.onAnswer).not.toHaveBeenCalled();
});

it("retains typed text and allows retry after a definitive command refusal", async () => {
  await render({ onAnswer: vi.fn().mockRejectedValue(new RemoteHostError("machine", "host", "Question is not ready", false)) });
  await act(async () => state.fields.get("Your answer")!("Keep my recovery steps"));
  await act(async () => send().click());
  expect(send().disabled).toBe(false);
  expect(container.querySelector("textarea")?.value).toBe("Keep my recovery steps");
  expect(container.textContent).toContain("Question is not ready");
  expect(container.textContent).toContain("Answer not sent");
});
