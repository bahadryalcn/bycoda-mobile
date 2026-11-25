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
const identifiers: { label: string; value: string; editable?: boolean; onChangeText(value: string): void }[] = [];
const sliders: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}[] = [];
let searchShown = false;
const headings: string[] = [];
const subheadings: string[] = [];

vi.mock("@/ui/provider-account-kind", () => ({ ProviderAccountKind: () => null }));
vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/ui/agent-avatar", () => ({ ProviderAccountMark: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ uiStyles: {} }) }));
vi.mock("@/ui/group-heading", () => ({
  GroupHeading: ({ title }: { title: string }) => { headings.push(title); return null; },
  SubgroupHeading: ({ title }: { title: string }) => { subheadings.push(title); return null; },
}));
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
    FormActions: () => null,
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
    IdentifierField: (props: typeof identifiers[number]) => { identifiers.push(props); return null; },
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
  identifiers.length = 0;
  sliders.length = 0;
  toggles.length = 0;
  disclosures.length = 0;
  searchShown = false;
  headings.length = 0;
  subheadings.length = 0;
});

it.each([false, true])("keeps a saved model outside the catalogue and preserves independent settings when selecting a listed model (sparse %s)", sparseSettings => {
  const settings = { crossSubagents: "auto", crossAdvisor: "null", crossSubagentMaxEffort: "high", crewTools: "[]" };
  const savedModel = "openrouter/anthropic:claude-sonnet-custom";
  const onChange = render({ model: savedModel, settings, sparseSettings });
  expect(identifiers).toHaveLength(0);
  expect(pressables.find(item => item.selected)?.label).toBe(savedModel);
  expect(onChange).not.toHaveBeenCalled();
  pressables.find(item => item.label === "M1")!.onPress();
  expect(onChange).toHaveBeenCalledWith("m1", settings);
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
    const onChooseModel = vi.fn();
    const available = {
      key: "claude:research",
      provider: "claude" as const,
      accountId: "research",
      label: "Research",
    };
    const catalog = { models: { claude: models(2) }, errors: {} } as never;
    render({
      choices: [available],
      choice: { key: "claude:gone", provider: "claude", label: "Account unavailable" },
      unavailableAccount: true,
      catalog,
      onChooseModel,
    });
    expect(headings).toEqual(["Claude · Account unavailable", "Claude · Research"]);
    const rows = pressables.filter((item) => item.kind === "row");
    // The unavailable account's own rows are locked; another account's rows repair the choice.
    expect(rows.slice(0, 3).every((item) => item.disabled)).toBe(true);
    expect(rows.slice(3).every((item) => !item.disabled)).toBe(true);
    rows[4]!.onPress();
    expect(onChooseModel).toHaveBeenCalledWith(available, "m1", {});
  });

  it("lists every provider and account as a group, in product order, without separate selects", () => {
    const codex: ProviderChoice = { key: "codex:", provider: "codex", label: "Codex" };
    const opencode: ProviderChoice = { key: "opencode:", provider: "opencode", label: "OpenCode" };
    const claude = (key: string, label: string, accountId?: string): ProviderChoice =>
      ({ key, provider: "claude", label, detail: "Claude", ...(accountId ? { accountId } : {}) });
    const catalog = {
      models: { claude: models(2), codex: [model("gpt")], opencode: [model("beam")] },
      errors: {},
    } as never;
    const onChooseModel = vi.fn();
    const onChange = render({
      // The session's provider first must not change the product order.
      choices: [opencode, codex, claude("claude:", "Default account"), claude("claude:w", "Work", "w")],
      choice: claude("claude:", "Default account"),
      models: models(2),
      catalog,
      onChooseModel,
    });
    expect(selects).toHaveLength(0);
    expect(headings).toEqual(["Claude · Default account", "Claude · Work", "Codex", "OpenCode"]);
    const rows = pressables.filter((item) => item.kind === "row");
    expect(rows.map((item) => item.label)).toEqual(["M0", "M1", "M0", "M1", "GPT", "BEAM"]);
    expect(rows.filter((item) => item.selected).map((item) => item.label)).toEqual(["M0"]);
    // The same model under another account keeps the effort; another provider starts from defaults.
    rows[2]!.onPress();
    expect(onChooseModel).toHaveBeenLastCalledWith(expect.objectContaining({ key: "claude:w" }), "m0", {});
    rows[4]!.onPress();
    expect(onChooseModel).toHaveBeenLastCalledWith(codex, "gpt", {});
    rows[1]!.onPress();
    expect(onChange).toHaveBeenCalledWith("m1", {});
  });

  it("groups effort variants of one model under its name", () => {
    const variants = ["Gemini 4 (High)", "Gemini 4 (Low)", "Flash"].map((name, index) =>
      ({ id: `g${index}`, name } as unknown as AgentModel));
    render({
      choices: [{ key: "antigravity:", provider: "antigravity", label: "Antigravity" }],
      models: variants,
      model: "g0",
    });
    expect(subheadings).toEqual(["Gemini 4"]);
    expect(pressables.filter((item) => item.kind === "row").map((item) => item.label)).toEqual(["High", "Low", "Flash"]);
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
