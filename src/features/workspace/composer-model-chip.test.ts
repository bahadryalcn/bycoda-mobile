// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ModelPickerProps } from "./model-picker";
import type { HostSession } from "./wire";

const fixture = vi.hoisted(() => ({
  switchAllowed: false,
  summary: "",
  accounts: [{ id: "default", label: "Default account", color: "fixture" }],
  command: vi.fn(async () => ({ commandId: "fixture-command", sessionId: "session", revision: 1 })),
  run: vi.fn(async (action: () => Promise<unknown>) => action()),
}));
let picker: ModelPickerProps | undefined;
vi.mock("@/state/actions", () => ({
  useAsyncAction: () => ({ run: fixture.run, reset: () => {}, isPending: false }),
}));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({ providers: ["claude", "codex"], capabilities: fixture.switchAllowed ? ["sessions.harnessSwitch"] : [] }),
}));
vi.mock("@/state/model-catalog", () => ({
  useModelCatalog: () => ({ data: { accounts: { claude: fixture.accounts } } }),
}));
vi.mock("@/ui/primitives", () => ({
  QueryState: () => null,
  Notice: ({ message }: { message: string }) => createElement("div", null, message),
}));
vi.mock("@/ui/chat-controls", () => ({
  ChatToolbarAction: ({ onPress, children, label, accessibilityLabel }: PropsWithChildren<{
    onPress: () => void; label: string; accessibilityLabel: string;
  }>) => createElement("button", { onClick: onPress, "aria-label": accessibilityLabel }, children, label),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./composer-model-mark", () => ({ ComposerModelMark: () => null }));
vi.mock("./model-picker", () => ({
  ModelPicker: (props: ModelPickerProps) => {
    picker = props;
    return null;
  },
}));
vi.mock("./model-picker-model", () => ({ settingsSummary: () => fixture.summary }));
vi.mock("./setting-labels", () => ({ settingLabels: () => ({}) }));
vi.mock("./catalog", () => ({
  catalogProviders: () => fixture.switchAllowed ? ["claude", "codex"] : ["claude"],
  sessionCatalog: () => ({ models: { claude: [{ id: "model", name: "Research model" }], codex: [{ id: "codex:new", name: "New model" }] } }),
  sessionModel: () => ({ id: "model" }),
  sessionSettings: (_model: unknown, settings: unknown) => settings,
  modelDefaults: () => ({}),
}));

import { ComposerModelChip } from "./composer-model-chip";
let root: Root, container: HTMLDivElement;
const session = {
  projectId: "project",
  status: "idle",
  session: {
    id: "session",
    harness: "claude",
    providerAccountId: "gone",
    model: "model",
    modelSettings: {},
    runtimeMode: "auto",
  },
} as unknown as HostSession;
const current = () => {
  if (!picker) throw new Error("Picker did not render");
  return picker;
};
const render = (blocked = false, value = session) =>
  act(() =>
    root.render(createElement(ComposerModelChip, { session: value, blocked, onCommand: fixture.command })),
  );
beforeEach(() => {
  fixture.switchAllowed = false;
  fixture.summary = "";
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fixture.command.mockClear();
  fixture.run.mockClear();
  picker = undefined;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

it("keeps the model name visible and includes reasoning in the spoken label", async () => {
  fixture.summary = "High";
  await render();
  const button = container.querySelector("button")!;
  expect(button.textContent).toBe("Research model");
  expect(button.getAttribute("aria-label")).toBe("Model and reasoning: Research model · High");
});

it("keeps advisor, subagent and tool restrictions when changing provider", async () => {
  fixture.switchAllowed = true;
  const settings = { crossSubagents: "auto", crossAdvisor: "null", crossSubagentMaxEffort: "high", crewTools: "[]" };
  await render(false, { ...session, session: { ...session.session, modelSettings: settings } });
  await act(() => container.querySelector("button")!.click());
  await act(() => current().onChooseProvider(current().choices.find(choice => choice.provider === "codex")!));
  expect(current().settings).toMatchObject(settings);
  expect(fixture.command).not.toHaveBeenCalled();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("keeps a removed saved account explicit without mutating on open or cancel", async () => {
  const before = structuredClone(session);
  await render();
  expect(current().choice?.label).toBe("Account unavailable");
  expect(current().choice?.key).toBe("claude:gone");
  expect(current().unavailableAccount).toBe(true);
  await act(() => container.querySelector("button")!.click());
  expect(current().visible).toBe(true);
  await act(() => current().onChange("another", {}));
  await act(() => current().onClose());
  expect(fixture.command).not.toHaveBeenCalled();
  expect(session).toEqual(before);
  await act(async () => current().onChooseProvider(current().choices[0]!));
  expect(fixture.command).not.toHaveBeenCalled();
  expect(current().dirty).toBe(true);
  await act(async () => current().onSave!());
  expect(fixture.command).toHaveBeenCalledWith(
    expect.objectContaining({ type: "configure", providerAccountId: null }),
  );
});

it("disables an already-open picker when the composer becomes blocked", async () => {
  await render();
  await act(() => container.querySelector("button")!.click());
  await render(true);
  expect(current().visible).toBe(true);
  expect(current().disabled).toBe(true);
  await act(async () => current().onChooseProvider(current().choices[0]!));
  expect(fixture.command).not.toHaveBeenCalled();
});
