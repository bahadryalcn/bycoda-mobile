import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentModel } from "../../../../src/features/sessions/model/models";
import type { ProviderChoice } from "./provider-choices";

type Pressable = {
  kind: string;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  style?: unknown;
};
const pressables: Pressable[] = [];
const renderOrder: string[] = [];
type SelectProps = {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
};
const selects: SelectProps[] = [];
const sliders: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}[] = [];
let searchShown = false;

vi.mock("@/ui/provider-account-kind", () => ({ ProviderAccountKind: () => null }));
vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/ui/agent-avatar", () => ({ ProviderAccountMark: () => null }));
vi.mock("@/ui/level-slider", () => ({
  LevelSlider: (props: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    disabled?: boolean;
    onChange: (value: string) => void;
  }) => {
    sliders.push(props);
    renderOrder.push("settings");
    return null;
  },
}));
vi.mock("./delegation-fields", () => ({ DelegationFields: () => null }));
vi.mock("./agent-option-icons", () => ({ SettingIcon: () => null }));
const toggles: { label: string; value: boolean; onChange: (value: boolean) => void }[] = [];
const disclosures: string[] = [];
vi.mock("@/ui/primitives", () => {
  const record = (kind: string) => (props: Pressable & { children?: ReactNode }) => {
    renderOrder.push(kind);
    pressables.push({
      kind,
      label: props.label,
      selected: props.selected,
      disabled: props.disabled,
      onPress: props.onPress,
      style: props.style,
    });
    return createElement("div", null, props.children);
  };
  const pass = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  return {
    Empty: () => null,
    NavigationGroup: pass,
    Body: pass,
    Sheet: pass,
    Disclosure: ({ label, children }: { label: string; children?: ReactNode }) => {
      disclosures.push(label);
      return createElement("div", null, children);
    },
    SearchField: () => {
      searchShown = true;
      return null;
    },
    NavigationRow: record("row"),
    SelectField: (props: SelectProps) => {
      selects.push(props);
      return null;
    },
    SegmentedControl: () => null,
    ToggleField: (props: { label: string; value: boolean; onChange: (value: boolean) => void }) => {
      toggles.push(props);
      return null;
    },
  };
});
import { ModelPicker } from "./model-picker";

const setting = (id: string, label: string, value: string, options: string[]) => ({
  id,
  label,
  value,
  options: options.map((option) => ({ value: option.toLowerCase(), label: option })),
});
const model = (id: string, extra: Partial<AgentModel> = {}) =>
  ({ id, nativeId: id, name: id.toUpperCase(), ...extra }) as unknown as AgentModel;
const reasoning = [
  setting("effort", "Reasoning", "medium", ["Low", "Medium", "High", "Extra High"]),
];
const models = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    model(`m${i}`, i === 0 ? ({ settings: reasoning } as never) : {}),
  );
const choice = (key: string): ProviderChoice => ({ key, provider: "claude", label: key });
let html = "";

function render(over: Partial<Parameters<typeof ModelPicker>[0]> = {}) {
  const onChange = vi.fn();
  const list = over.models ?? models(3);
  const choices = over.choices ?? [choice("claude:")];
  html = renderToStaticMarkup(
    createElement(ModelPicker, {
      visible: true,
      onClose: vi.fn(),
      choices,
      choice: choices[0],
      onChooseProvider: vi.fn(),
      models: list,
      model: "m0",
      settings: {},
      onChange,
      ...over,
    }),
  );
  return onChange;
}

beforeEach(() => {
  pressables.length = 0;
  renderOrder.length = 0;
  selects.length = 0;
  sliders.length = 0;
  toggles.length = 0;
  disclosures.length = 0;
  searchShown = false;
});

describe("model picker view", () => {
  it("hides the account group with a single choice", () => {
    render();
    expect(pressables.filter((p) => p.kind === "account")).toHaveLength(0);
  });
  it("names a single provider/account without adding a redundant selector", () => {
    render({
      choices: [
        {
          key: "claude:research",
          provider: "claude",
          accountId: "research",
          label: "İstanbul research 🧪",
        },
      ],
    });
    expect(html).toContain("Claude");
    expect(html).toContain("İstanbul research 🧪");
    expect(selects).toHaveLength(0);
  });
  it("keeps a removed saved account explicit and offers an owner-selected repair", () => {
    const onChooseProvider = vi.fn();
    const available = {
      key: "claude:research",
      provider: "claude" as const,
      accountId: "research",
      label: "Research",
    };
    render({
      choices: [available],
      choice: { key: "claude:gone", provider: "claude", label: "Account unavailable" },
      unavailableAccount: true,
      onChooseProvider,
    });
    const account = selects.find((select) => select.label === "Account")!;
    expect(account.value).toBe("claude:gone");
    expect(account.options).toContainEqual(
      expect.objectContaining({
        value: "claude:gone",
        label: "Account unavailable",
        disabled: true,
      }),
    );
    expect(account.disabled).toBeFalsy();
    expect(pressables.filter((item) => item.kind === "row").every((item) => item.disabled)).toBe(
      true,
    );
    expect(onChooseProvider).not.toHaveBeenCalled();
    account.onChange("claude:research");
    expect(onChooseProvider).toHaveBeenCalledWith(available);
  });

  it("picks the agent in one select and the account in a second one", () => {
    const codex: ProviderChoice = { key: "codex:", provider: "codex", label: "Codex" };
    const onChooseProvider = vi.fn();
    render({
      choices: [choice("claude:"), choice("claude:a"), choice("claude:b"), codex],
      onChooseProvider,
    });
    expect(pressables.filter((p) => p.kind === "account")).toHaveLength(0);
    expect(selects.map((select) => select.label)).toEqual(["Agent", "Account"]);
    expect(selects[0]!.options.map((option) => option.value)).toEqual(["claude", "codex"]);
    expect(selects[1]!.options.map((option) => option.value)).toEqual([
      "claude:",
      "claude:a",
      "claude:b",
    ]);
    selects[1]!.onChange("claude:b");
    expect(onChooseProvider).toHaveBeenCalledWith(expect.objectContaining({ key: "claude:b" }));
    selects[0]!.onChange("codex");
    expect(onChooseProvider).toHaveBeenLastCalledWith(codex);
  });

  it("offers no account select when the chosen agent has one login", () => {
    render({ choices: [choice("claude:"), { key: "codex:", provider: "codex", label: "Codex" }] });
    expect(selects.map((select) => select.label)).toEqual(["Agent"]);
  });

  it("shows the reasoning scale as one slider and applies the released step as the new settings", () => {
    const onChange = render({ settings: { effort: "medium", keep: "x" } });
    expect(pressables.filter((p) => p.kind === "chip")).toHaveLength(0);
    expect(sliders).toHaveLength(1);
    expect(sliders[0]!.options.map((option) => option.label)).toEqual([
      "Low",
      "Medium",
      "High",
      "Extra High",
    ]);
    expect(sliders[0]!.value).toBe("medium");
    sliders[0]!.onChange("high");
    expect(onChange).toHaveBeenCalledWith("m0", { effort: "high", keep: "x" });
  });

  it("shows Fast as one switch and the secondary groups in disclosures", () => {
    const fast = setting("serviceTier", "Service Tier", "standard", ["Standard", "Fast"]);
    const compact = setting("autoCompact", "Auto-compact", "off", ["Off", "On"]);
    const advisor = setting("advisor", "Advisor", "off", ["Off", "Opus", "Sonnet", "Haiku"]);
    const onChange = render({
      models: [model("m0", { settings: [...reasoning, fast, compact, advisor] } as never)],
      settings: {},
    });
    expect(toggles.map((toggle) => toggle.label)).toEqual(["Fast", "Auto-compact"]);
    expect(toggles[0]!.value).toBe(false);
    toggles[0]!.onChange(true);
    expect(onChange).toHaveBeenCalledWith("m0", { serviceTier: "fast" });
    expect(disclosures).toEqual(["Context", "Advisor and subagents"]);
    expect(selects.map((select) => select.label)).toEqual(["Advisor"]);
  });

  it("replaces the provider advisor with bycoda's Agents when the catalogue is known", () => {
    const advisor = setting("advisor", "Advisor", "off", ["Off", "Opus", "Sonnet", "Haiku"]);
    const catalog = { models: { claude: [model("m0")] }, errors: {} } as never;
    render({
      models: [model("m0", { settings: [...reasoning, advisor] } as never)],
      settings: {},
      catalog,
    });
    expect(disclosures).toEqual(["Agents"]);
    expect(selects.map((select) => select.label)).toEqual([]);
  });

  it("locks rows and sliders while disabled", () => {
    render({ disabled: true });
    const all = pressables.filter((p) => p.kind === "row");
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((p) => p.disabled)).toBe(true);
    expect(sliders.every((slider) => slider.disabled)).toBe(true);
  });

  it("shows search only above six models", () => {
    render({ models: models(6) });
    expect(searchShown).toBe(false);
    render({ models: models(7) });
    expect(searchShown).toBe(true);
  });

  it("keeps a form draft sparse when a model is picked", () => {
    const onChange = render({ sparseSettings: true });
    pressables.find((p) => p.kind === "row" && p.label === "M1")!.onPress();
    expect(onChange).toHaveBeenCalledWith("m1", {});
  });
  it("leaves custom effort untouched when selected model is pressed", () => {
    const onChange = render({ settings: { effort: "high" } });
    pressables.find((item) => item.kind === "row" && item.selected)!.onPress();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders selected effort before long model catalog", () => {
    render({ models: models(25) });
    expect(renderOrder.indexOf("settings")).toBeLessThan(renderOrder.indexOf("row"));
  });
});
