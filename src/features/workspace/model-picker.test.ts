// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import type { AgentModel } from "../../../../src/features/sessions/model/models";
import type { ProviderChoice } from "./provider-choices";

type Pressable = {
  kind: string;
  label: string;
  detail?: string;
  accessibilityLabel?: string;
  selected?: boolean;
  disabled?: boolean;
  icon?: boolean;
  intent?: string;
  onPress: () => void;
  style?: unknown;
};
type Choices = {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
};
const pressables: Pressable[] = [];
const renderOrder: string[] = [];
const selects: Choices[] = [];
const segments: Choices[] = [];
const rails: Choices[] = [];
const identifiers: { label: string; value: string; editable?: boolean; onChangeText(value: string): void }[] = [];
const sliders: Choices[] = [];
const searchFields: { onChangeText: (value: string) => void }[] = [];
const headings: string[] = [];
const delegationFields: unknown[] = [];
const toggles: { label: string; value: boolean; onChange: (value: boolean) => void }[] = [];
const disclosures: { label: string; defaultExpanded?: boolean }[] = [];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/ui/provider-account-kind", () => ({ ProviderAccountKind: () => null }));
vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/ui/copy", () => ({
  useCopy: () => (_tr: string, en: string, values?: Record<string, string | number>) =>
    values ? en.replace(/\{(p\d+)\}/g, (_match, key: string) => String(values[key])) : en,
}));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/ui/agent-avatar", () => ({ ProviderAccountMark: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ uiStyles: {} }) }));
vi.mock("@/ui/group-heading", () => ({
  GroupHeading: ({ title }: { title: string }) => { headings.push(title); return null; },
  SubgroupHeading: () => null,
}));
vi.mock("@/ui/filter-sheet", () => ({
  FilterChipRow: (props: Choices) => { rails.push(props); renderOrder.push("rail"); return null; },
}));
vi.mock("@/ui/level-slider", () => ({
  LevelSlider: (props: Choices) => {
    sliders.push(props);
    renderOrder.push("settings");
    return null;
  },
}));
vi.mock("./delegation-fields", () => ({
  DelegationFields: (props: unknown) => { delegationFields.push(props); return null; },
}));
vi.mock("./agent-option-icons", () => ({ SettingIcon: () => null }));
vi.mock("./model-picker-account-usage", () => ({ MachinePickerAccountRows: () => null }));
vi.mock("@/ui/primitives", () => {
  const record = (kind: string) => (props: Pressable & { children?: ReactNode }) => {
    renderOrder.push(kind);
    pressables.push({
      kind,
      label: props.label,
      detail: props.detail,
      accessibilityLabel: props.accessibilityLabel,
      selected: props.selected,
      disabled: props.disabled,
      icon: !!props.icon,
      intent: props.intent,
      onPress: props.onPress,
      style: props.style,
    });
    return createElement("div", null, props.children);
  };
  const pass = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  return {
    Empty: ({ title }: { title: string }) => createElement("p", null, title),
    NavigationGroup: pass,
    FormActions: () => null,
    Body: pass,
    Sheet: pass,
    Disclosure: ({ label, defaultExpanded, children }: { label: string; defaultExpanded?: boolean; children?: ReactNode }) => {
      disclosures.push({ label, defaultExpanded });
      return createElement("div", null, children);
    },
    SearchField: (props: { onChangeText: (value: string) => void }) => {
      searchFields.push(props);
      return null;
    },
    NavigationRow: record("row") as never,
    SelectField: (props: Choices) => {
      selects.push(props);
      return null;
    },
    IdentifierField: (props: typeof identifiers[number]) => { identifiers.push(props); return null; },
    SegmentedControl: (props: Choices) => { segments.push(props); return null; },
    ToggleField: (props: { label: string; value: boolean; onChange: (value: boolean) => void }) => {
      toggles.push(props);
      return null;
    },
  };
});
import { ModelPicker } from "./model-picker";
import { PickerAccountRows } from "./model-picker-accounts";

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

function reset() {
  pressables.length = 0;
  renderOrder.length = 0;
  selects.length = 0;
  segments.length = 0;
  rails.length = 0;
  identifiers.length = 0;
  sliders.length = 0;
  toggles.length = 0;
  disclosures.length = 0;
  searchFields.length = 0;
  headings.length = 0;
  delegationFields.length = 0;
}

type Props = Parameters<typeof ModelPicker>[0];
function props(over: Partial<Props>) {
  const onChange = vi.fn();
  const choices = over.choices ?? [choice("claude:")];
  return {
    onChange,
    props: {
      visible: true,
      onClose: vi.fn(),
      choices,
      choice: choices[0],
      onChooseProvider: vi.fn(),
      models: over.models ?? models(3),
      model: "m0",
      settings: {},
      onChange,
      ...over,
    } as Props,
  };
}

function render(over: Partial<Props> = {}) {
  const { onChange, props: all } = props(over);
  html = renderToStaticMarkup(createElement(ModelPicker, all));
  return onChange;
}

let root: Root | undefined;
/** A live render for state changes (provider rail, account, search, segments). */
function mount(over: Partial<Props> = {}) {
  const { onChange, props: all } = props(over);
  const host = document.createElement("div");
  root = createRoot(host);
  act(() => root!.render(createElement(ModelPicker, all)));
  return onChange;
}
/** Calls a recorded callback and keeps only what the next render records. */
function interact<T>(target: T, run: (target: T) => void) {
  reset();
  act(() => run(target));
}
/** Model rows; account and recent rows lead with a provider mark. */
const rows = () => pressables.filter((item) => item.kind === "row" && !item.icon);
const accountRows = () => pressables.filter((item) => item.kind === "row" && item.icon && item.intent !== "command");
const recentRows = () => pressables.filter((item) => item.kind === "row" && item.intent === "command");

beforeEach(reset);
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
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
  it("shows neither a provider rail nor an account choice with a single choice", () => {
    render();
    expect(rails).toHaveLength(0);
    expect(segments).toHaveLength(0);
    expect(accountRows()).toHaveLength(0);
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
    expect(segments).toHaveLength(0);
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
    mount({
      choices: [available],
      choice: { key: "claude:gone", provider: "claude", label: "Account unavailable" },
      unavailableAccount: true,
      catalog,
      ownAgents: false,
      onChooseModel,
    });
    expect(accountRows().map((item) => [item.label, item.selected])).toEqual([["Account unavailable", true], ["Research", false]]);
    // The unavailable account's own rows are locked; another account repairs the choice.
    expect(rows()).toHaveLength(3);
    expect(rows().every((item) => item.disabled)).toBe(true);
    // One tap moves the saved model to the available account.
    interact(accountRows()[1]!, (item) => item.onPress());
    expect(onChooseModel).toHaveBeenCalledWith(available, "m0", {});
    expect(rows().map((item) => item.label)).toEqual(["M0", "M1"]);
    expect(rows().every((item) => !item.disabled)).toBe(true);
    rows()[1]!.onPress();
    expect(onChooseModel).toHaveBeenLastCalledWith(available, "m1", {});
  });

  it("browses providers on a rail in product order and accounts as rows instead of repeated sections", () => {
    const codex: ProviderChoice = { key: "codex:", provider: "codex", label: "Codex" };
    const opencode: ProviderChoice = { key: "opencode:", provider: "opencode", label: "OpenCode" };
    const claude = (key: string, label: string, accountId?: string): ProviderChoice =>
      ({ key, provider: "claude", label, detail: "Claude", ...(accountId ? { accountId } : {}) });
    const catalog = {
      models: { claude: models(2), codex: [model("gpt")], opencode: [model("beam")] },
      errors: {},
    } as never;
    const onChooseModel = vi.fn();
    const onChange = mount({
      // The session's provider first must not change the product order.
      choices: [opencode, codex, claude("claude:", "Default account"), claude("claude:w", "Work", "w")],
      choice: claude("claude:", "Default account"),
      models: models(2),
      catalog,
      ownAgents: false,
      onChooseModel,
    });
    expect(selects).toHaveLength(0);
    expect(headings).toEqual(["Account"]);
    expect(rails[0]!.options.map((option) => option.label)).toEqual(["Claude", "Codex", "OpenCode"]);
    expect(rails[0]!.value).toBe("claude");
    expect(segments.find((item) => item.label === "Account")).toBeUndefined();
    expect(accountRows().map((item) => [item.label, item.selected])).toEqual([["Default account", true], ["Work", false]]);
    expect(rows().map((item) => item.label)).toEqual(["M0", "M1"]);
    expect(rows().filter((item) => item.selected).map((item) => item.label)).toEqual(["M0"]);
    rows()[1]!.onPress();
    expect(onChange).toHaveBeenCalledWith("m1", {});
    // Another account of the session's provider takes the same model and settings in one tap.
    interact(accountRows()[1]!, (item) => item.onPress());
    expect(onChooseModel).toHaveBeenLastCalledWith(expect.objectContaining({ key: "claude:w" }), "m0", {});
    expect(accountRows().map((item) => [item.label, item.selected])).toEqual([["Default account", false], ["Work", true]]);
    // Another provider starts from its defaults and has no account choice.
    interact(rails[0]!, (item) => item.onChange("codex"));
    expect(accountRows()).toHaveLength(0);
    expect(rows().map((item) => item.label)).toEqual(["GPT"]);
    rows()[0]!.onPress();
    expect(onChooseModel).toHaveBeenLastCalledWith(codex, "gpt", {});
  });

  it("searches every provider and account, with results under their headings", () => {
    const codex: ProviderChoice = { key: "codex:", provider: "codex", label: "Codex" };
    const catalog = { models: { claude: models(7), codex: [model("m1-codex")] }, errors: {} } as never;
    mount({ choices: [{ key: "claude:", provider: "claude", label: "Claude" }, codex], models: models(7), catalog, ownAgents: false });
    expect(searchFields).toHaveLength(1);
    interact(searchFields[0]!, (item) => item.onChangeText("m1"));
    expect(rails).toHaveLength(0);
    expect(headings).toEqual(["Claude", "Codex"]);
    expect(rows().map((item) => item.label)).toEqual(["M1", "M1-CODEX"]);
    interact(searchFields[0]!, (item) => item.onChangeText("nothing"));
    expect(rows()).toHaveLength(0);
  });

  it("shows effort variants of one model as one row with the effort in the Reasoning control", () => {
    const variants = ["Gemini 4 (High)", "Gemini 4 (Low)", "Flash"].map((name, index) =>
      ({ id: `g${index}`, name } as unknown as AgentModel));
    const onChange = render({
      choices: [{ key: "antigravity:", provider: "antigravity", label: "Antigravity" }],
      models: variants,
      model: "g1",
      settings: { keep: "x" },
    });
    expect(rows().map((item) => [item.label, item.selected])).toEqual([["Gemini 4", true], ["Flash", false]]);
    expect(rows()[0]!.detail).toBe("Low");
    expect(html).toContain("Gemini 4");
    const effort = segments.find((item) => item.label === "Reasoning")!;
    expect(effort.options.map((option) => option.label)).toEqual(["Low", "High"]);
    expect(effort.value).toBe("g1");
    effort.onChange("g0");
    expect(onChange).toHaveBeenCalledWith("g0", { keep: "x" });
  });

  it("opens a picked family at the effort in use", () => {
    const variants = [
      { id: "g0", name: "Gemini 4 (High)" },
      { id: "g1", name: "Gemini 4 (Low)" },
      { id: "flash", name: "Flash", settings: [setting("effort", "Reasoning", "high", ["Low", "High"])] },
    ] as unknown as AgentModel[];
    const onChange = render({
      choices: [{ key: "antigravity:", provider: "antigravity", label: "Antigravity" }],
      models: variants,
      model: "flash",
      settings: { effort: "low" },
      sparseSettings: true,
    });
    expect(rows()[0]!.detail).toBe("Low – High");
    rows()[0]!.onPress();
    expect(onChange).toHaveBeenCalledWith("g1", {});
  });

  it("groups a multi-vendor catalogue by vendor with only the selected vendor open", () => {
    const hermes = [
      { id: "auto-opus", name: "Auto · anthropic/claude-opus-4.6" },
      { id: "a-opus", name: "Anthropic · claude-opus-4-8" },
      { id: "a-fable", name: "Anthropic · claude-fable-5-2" },
    ] as unknown as AgentModel[];
    render({
      choices: [{ key: "hermes:", provider: "hermes", label: "Hermes" }],
      models: hermes,
      model: "a-fable",
    });
    expect(disclosures).toEqual([
      { label: "Auto", defaultExpanded: false },
      { label: "Anthropic", defaultExpanded: true },
    ]);
    expect(rows().map((item) => item.label)).toEqual(["anthropic/claude-opus-4.6", "claude-opus-4-8", "claude-fable-5-2"]);
    expect(rows()[1]!.accessibilityLabel).toContain("Anthropic · claude-opus-4-8");
    expect(html).toContain("Anthropic · claude-fable-5-2");
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
    expect(disclosures.map((item) => item.label)).toEqual(["Context", "Advisor and subagents"]);
    expect(selects.map((select) => select.label)).toEqual(["Advisor"]);
  });

  it("moves bycoda's Agents into their own segment, counting the configured helpers", () => {
    const advisor = setting("advisor", "Advisor", "off", ["Off", "Opus", "Sonnet", "Haiku"]);
    const catalog = { models: { claude: [model("m0")] }, errors: {} } as never;
    mount({
      models: [model("m0", { settings: [...reasoning, advisor] } as never)],
      settings: { crossAdvisor: JSON.stringify({ harness: "claude", model: "m0" }) },
      catalog,
    });
    expect(disclosures).toEqual([]);
    expect(selects.map((select) => select.label)).toEqual([]);
    expect(delegationFields).toHaveLength(0);
    const view = segments.find((item) => item.label === "View")!;
    expect(view.options.map((option) => option.label)).toEqual(["Model", "Agents (1)"]);
    interact(view, (item) => item.onChange("agents"));
    expect(delegationFields).toHaveLength(1);
    expect(rows()).toHaveLength(0);
    expect(sliders).toHaveLength(0);
  });

  it("locks rows and sliders while disabled", () => {
    render({ disabled: true });
    const all = rows();
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((p) => p.disabled)).toBe(true);
    expect(sliders.every((slider) => slider.disabled)).toBe(true);
  });

  it("shows search only above six models", () => {
    render({ models: models(6) });
    expect(searchFields).toHaveLength(0);
    render({ models: models(7) });
    expect(searchFields).toHaveLength(1);
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

  describe("accounts", () => {
    const claude = (key: string, label: string, accountId?: string, color?: string): ProviderChoice =>
      ({ key, provider: "claude", label, detail: "Claude", ...(accountId ? { accountId } : {}), ...(color ? { color } : {}) });
    const home = claude("claude:", "Default account");
    const work = claude("claude:w", "Work", "w");

    it("shows the account in use selected after a one-tap switch", () => {
      const catalog = { models: { claude: models(2) }, errors: {} } as never;
      const onChooseModel = vi.fn();
      const { props: all } = props({ choices: [home, work], choice: home, models: models(2), catalog, ownAgents: false, onChooseModel, settings: { effort: "high" } });
      const host = document.createElement("div");
      root = createRoot(host);
      act(() => root!.render(createElement(ModelPicker, all)));
      interact(accountRows()[1]!, (item) => item.onPress());
      expect(onChooseModel).toHaveBeenCalledWith(work, "m0", { effort: "high" });
      // The owner applies the draft: the same model row is selected under the new account.
      interact(undefined, () => root!.render(createElement(ModelPicker, { ...all, choice: work })));
      expect(accountRows().map((item) => [item.label, item.selected])).toEqual([["Default account", false], ["Work", true]]);
      expect(rows().filter((item) => item.selected).map((item) => item.label)).toEqual(["M0"]);
    });

    it("only browses another account when it does not list the model in use", () => {
      const catalog = { models: { claude: [model("other")] }, errors: {} } as never;
      const onChooseModel = vi.fn();
      mount({ choices: [home, work], choice: home, models: models(2), catalog, ownAgents: false, onChooseModel });
      interact(accountRows()[1]!, (item) => item.onPress());
      expect(onChooseModel).not.toHaveBeenCalled();
      expect(rows().map((item) => item.label)).toEqual(["OTHER"]);
      expect(accountRows().map((item) => [item.label, item.selected, item.detail])).toEqual([
        ["Default account", false, "In use"],
        ["Work", true, undefined],
      ]);
    });

    it("only scopes the list on another provider", () => {
      const codex: ProviderChoice = { key: "codex:", provider: "codex", label: "Default account", detail: "Codex" };
      const codexWork: ProviderChoice = { key: "codex:w", provider: "codex", accountId: "w", label: "Work", detail: "Codex" };
      const catalog = { models: { claude: models(1), codex: [model("m0")] }, errors: {} } as never;
      const onChooseModel = vi.fn();
      mount({ choices: [home, codex, codexWork], choice: home, models: models(1), catalog, ownAgents: false, onChooseModel });
      interact(rails[0]!, (item) => item.onChange("codex"));
      interact(accountRows()[1]!, (item) => item.onPress());
      expect(onChooseModel).not.toHaveBeenCalled();
      expect(accountRows().find((item) => item.selected)?.label).toBe("Work");
      rows()[0]!.onPress();
      expect(onChooseModel).toHaveBeenCalledWith(codexWork, "m0", {});
    });

    it("lists signed-out and disabled accounts as disabled rows without making them choices", () => {
      const catalog = {
        models: { claude: models(1) },
        errors: {},
        accounts: { claude: [
          { id: "default", label: "Host default", status: "ready" },
          { id: "old", label: "Old", status: "signed-out" },
          { id: "off", label: "Off", status: "disabled" },
        ] },
      } as never;
      mount({ choices: [home], choice: home, models: models(1), catalog, ownAgents: false, onChooseModel: vi.fn() });
      expect(accountRows().map((item) => [item.label, item.detail, !!item.disabled])).toEqual([
        ["Default account", undefined, false],
        ["Old", "Signed out", true],
        ["Off", "Disabled", true],
      ]);
    });

    it("folds accounts beyond four behind Other accounts, keeping the one in use", () => {
      const choices = [home, ...["a", "b", "c", "d"].map((id) => claude(`claude:${id}`, id.toUpperCase(), id))];
      const catalog = { models: { claude: models(1) }, errors: {} } as never;
      mount({ choices, choice: choices[2], models: models(1), catalog, ownAgents: false, onChooseModel: vi.fn() });
      expect(disclosures.map((item) => item.label)).toEqual(["Other accounts (4)"]);
      expect(accountRows()[0]!.label).toBe("B");
    });

    it("labels each account with its quota, an exhausted one stays selectable", () => {
      const now = Date.now();
      const reading = (leftPercent: number, resetsAt: number | null) =>
        ({ usedPercent: 100 - leftPercent, leftPercent, regainPercent: 0, windowMinutes: 300, resetsAt, timeLeftPercent: null, pace: null });
      const usage = {
        environmentId: "e", sampledAt: now, source: "host-provider-api",
        providers: [{ provider: "claude", accounts: [], cards: [
          { key: "session", kind: "session", model: null, best: reading(62, null), accounts: [
            { id: "default", label: "Host default", color: "#000", reading: reading(62, now + 3_600_000) },
            { id: "w", label: "Work", color: "#111", reading: reading(0, now + 3_600_000) },
          ] },
        ] }],
      } as never;
      const account = (choice: ProviderChoice, own: boolean) => ({ key: choice.key, choice, label: choice.label, title: choice.label, own, groups: [] });
      renderToStaticMarkup(createElement(PickerAccountRows, {
        accounts: [account(home, true), account(work, false)],
        unavailable: [],
        browsed: "claude:",
        onBrowse: vi.fn(),
        usage,
      }));
      const [first, second] = accountRows();
      expect(first!.detail).toBe("62% left");
      expect(second!.detail).toMatch(/^Limit reached · resets /);
      expect(second!.disabled).toBeFalsy();
    });
  });

  it("offers recent models in one tap, without the current one, above the provider rail", () => {
    const codex: ProviderChoice = { key: "codex:", provider: "codex", label: "Codex" };
    const catalog = { models: { claude: models(2), codex: [model("gpt")] }, errors: {} } as never;
    const onChooseModel = vi.fn();
    const onChange = mount({
      choices: [{ key: "claude:", provider: "claude", label: "Claude" }, codex],
      models: models(2),
      catalog,
      ownAgents: false,
      onChooseModel,
      settings: { effort: "high" },
      recents: [
        { provider: "claude", model: "m0" },
        { provider: "codex", model: "gpt" },
        { provider: "codex", model: "gone" },
        { provider: "claude", model: "m1" },
      ],
    });
    expect(headings).toEqual(["Recent"]);
    expect(recentRows().map((item) => [item.label, item.detail])).toEqual([["GPT", "Codex"], ["M1", "Claude"]]);
    expect(renderOrder.indexOf("row")).toBeLessThan(renderOrder.indexOf("rail"));
    recentRows()[0]!.onPress();
    expect(onChooseModel).toHaveBeenCalledWith(codex, "gpt", {});
    recentRows()[1]!.onPress();
    expect(onChange).toHaveBeenCalledWith("m1", {});
  });

  it("hides recent models while searching and when none is offered", () => {
    render({ recents: [{ provider: "claude", model: "m0" }] });
    expect(recentRows()).toHaveLength(0);
    expect(headings).toEqual([]);
    mount({ models: models(7), recents: [{ provider: "claude", model: "m1" }] });
    expect(recentRows().map((item) => item.label)).toEqual(["M1"]);
    interact(searchFields[0]!, (item) => item.onChangeText("m"));
    expect(recentRows()).toHaveLength(0);
  });

  it("opens on the session's provider while its list is empty, with an honest state", () => {
    const codex: ProviderChoice = { key: "codex:", provider: "codex", label: "Codex" };
    const choices: ProviderChoice[] = [{ key: "claude:", provider: "claude", label: "Claude" }, codex];
    render({ choices, models: [], model: "", catalog: { models: { codex: [model("gpt")] }, errors: {} } as never, ownAgents: false });
    expect(rails[0]!.value).toBe("claude");
    expect(rails[0]!.options.map((option) => option.label)).toEqual(["Claude", "Codex"]);
    expect(html).toContain("This account&#x27;s models could not be loaded.");
    reset();
    render({ choices, models: [], model: "", catalog: { models: { codex: [model("gpt")] }, errors: {}, pending: ["claude"] } as never, ownAgents: false });
    expect(html).toContain("Loading models…");
    // A saved model keeps its row; the state under it still says why nothing else is listed.
    reset();
    render({ choices, models: [], model: "saved", catalog: { models: { codex: [model("gpt")] }, errors: {} } as never, ownAgents: false });
    expect(rows().map((item) => item.label)).toEqual(["saved"]);
    expect(html).toContain("This account&#x27;s models could not be loaded.");
  });

  it("moves a model saved by its native id to another account in one tap", () => {
    const work: ProviderChoice = { key: "claude:w", provider: "claude", accountId: "w", label: "Work" };
    const list = [model("m0", { nativeId: "native-m0" }), model("m1")];
    const onChooseModel = vi.fn();
    mount({
      choices: [{ key: "claude:", provider: "claude", label: "Default account" }, work],
      models: list,
      model: "native-m0",
      settings: { effort: "high" },
      catalog: { models: { claude: list }, errors: {} } as never,
      ownAgents: false,
      onChooseModel,
    });
    interact(accountRows()[1]!, (item) => item.onPress());
    expect(onChooseModel).toHaveBeenCalledWith(work, "native-m0", { effort: "high" });
  });

  it("starts each opening on the session's provider after a consumer closes it", () => {
    const codex: ProviderChoice = { key: "codex:", provider: "codex", label: "Codex" };
    const { props: all } = props({
      choices: [{ key: "claude:", provider: "claude", label: "Claude" }, codex],
      catalog: { models: { claude: models(3), codex: [model("gpt")] }, errors: {} } as never,
      ownAgents: false,
    });
    root = createRoot(document.createElement("div"));
    act(() => root!.render(createElement(ModelPicker, all)));
    interact(rails[0]!, (item) => item.onChange("codex"));
    expect(rails[0]!.value).toBe("codex");
    // The consumer hides the sheet itself (after a save) and shows it again.
    act(() => root!.render(createElement(ModelPicker, { ...all, visible: false })));
    reset();
    act(() => root!.render(createElement(ModelPicker, { ...all, visible: true })));
    expect(rails[0]!.value).toBe("claude");
  });

  it("keeps the effort in use when another model offers it", () => {
    const next = model("m1", { settings: [setting("reasoningEffort", "Reasoning", "low", ["Low", "High"])] } as never);
    const both = [model("m0", { settings: reasoning } as never), next];
    let onChange = render({ models: both, settings: { effort: "high" } });
    rows()[1]!.onPress();
    expect(onChange).toHaveBeenCalledWith("m1", { reasoningEffort: "high" });
    // A sparse form carries only an effort the owner chose.
    reset();
    onChange = render({ models: both, settings: { effort: "high" }, sparseSettings: true });
    rows().find((item) => item.label === "M1")!.onPress();
    expect(onChange).toHaveBeenCalledWith("m1", { reasoningEffort: "high" });
    reset();
    onChange = render({ models: both, settings: {}, sparseSettings: true });
    rows().find((item) => item.label === "M1")!.onPress();
    expect(onChange).toHaveBeenCalledWith("m1", {});
  });

  it("counts a model once for search, however many accounts list it", () => {
    const catalog = { models: { claude: models(4) }, errors: {} } as never;
    const choices: ProviderChoice[] = [
      { key: "claude:", provider: "claude", label: "Default account" },
      { key: "claude:w", provider: "claude", accountId: "w", label: "Work" },
    ];
    render({ choices, models: models(4), catalog, ownAgents: false });
    expect(searchFields).toHaveLength(0);
  });
});
