// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ModelPickerProps } from "./model-picker";
import type { HostSession } from "./wire";

const fixture = vi.hoisted(() => ({
  switchAllowed: false,
  summary: "",
  fontScale: 1,
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
  useModelCatalog: () => ({ data: { accounts: { claude: fixture.accounts } }, refetch: async () => undefined }),
}));
vi.mock("@/ui/primitives", () => ({
  QueryState: () => null,
  Notice: ({ message }: { message: string }) => createElement("div", null, message),
}));
vi.mock("@/ui/chat-controls", () => ({
  ChatToolbarAction: ({ onPress, children, label, accessibilityLabel, hideLabel }: PropsWithChildren<{
    onPress: () => void; label: string; accessibilityLabel: string; hideLabel?: boolean;
  }>) => createElement("button", { onClick: onPress, "aria-label": accessibilityLabel }, children, hideLabel ? null : label),
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("span", null, children),
  useWindowDimensions: () => ({ fontScale: fixture.fontScale }),
}));
vi.mock("lucide-react-native/icons/shield-alert", () => ({ default: () => createElement("i", { "data-full-access": true }) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/tokens", () => ({ space: { xxs: 2 } }));
const access = vi.hoisted(() => ({ props: undefined as undefined | { value: string; onChange: (mode: string) => void; disabled: boolean } }));
vi.mock("./composer-access", () => ({
  accessModeLabel: (mode: string) => mode,
  ComposerAccessField: (props: NonNullable<typeof access.props>) => { access.props = props; return null; },
}));
vi.mock("./composer-context-meter", () => ({ ComposerContextSection: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./composer-model-mark", () => ({ ComposerModelMark: () => null }));
vi.mock("./model-picker", () => ({
  ModelPicker: (props: ModelPickerProps) => {
    picker = props;
    return props.extra ?? null;
  },
}));
vi.mock("./model-picker-model", () => ({ settingsSummary: () => fixture.summary }));
vi.mock("./setting-labels", () => ({ settingLabels: () => ({}) }));
vi.mock("./catalog", async (importOriginal) => ({
  activeSessionModel: (await importOriginal<typeof import("./catalog")>()).activeSessionModel,
  catalogProviders: () => fixture.switchAllowed ? ["claude", "codex"] : ["claude"],
  sessionCatalog: () => ({ models: { claude: [{ id: "model", name: "Research model" }], codex: [{ id: "codex:new", name: "New model" }] } }),
  sessionModel: () => ({ id: "model" }),
  sessionSettings: (_model: unknown, settings: unknown) => settings,
  modelDefaults: () => ({}),
}));

import { ComposerModelChip } from "./composer-model-chip";
import { openModelSheet } from "./composer-model-sheet";
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
const render = (blocked = false, value = session, iconOnly = false) =>
  act(() =>
    root.render(createElement(ComposerModelChip, { machineId: "machine", session: value, blocked, iconOnly, onCommand: fixture.command })),
  );
beforeEach(() => {
  fixture.switchAllowed = false;
  fixture.summary = "";
  fixture.fontScale = 1;
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
  expect(button.textContent).toBe("Research model · High");
  expect(button.getAttribute("aria-label")).toBe("Model and access: Research model · High. Access: auto");
  fixture.fontScale = 1.8;
  await render();
  expect(button.textContent).toBe("Research model");
  expect(button.getAttribute("aria-label")).toBe("Model and access: Research model · High. Access: auto");
});

it("shows only the mark in a short slot and a warning glyph for full access, keeping the full spoken label", async () => {
  await render(false, { ...session, session: { ...session.session, runtimeMode: "full-access" } } as HostSession, true);
  const button = container.querySelector("button")!;
  expect(button.textContent).toBe("");
  expect(button.querySelector("[data-full-access]")).not.toBeNull();
  expect(button.getAttribute("aria-label")).toBe("Model and access: Research model. Access: full-access");
});

it("keeps an access choice in the sheet draft and sends it only with Save", async () => {
  fixture.accounts = [{ id: "gone", label: "Saved", color: "fixture" }];
  try {
    await render();
    await act(() => container.querySelector("button")!.click());
    expect(current().title).toBe("Model and access");
    await act(async () => access.props!.onChange("supervised"));
    expect(fixture.command).not.toHaveBeenCalled();
    expect(current().dirty).toBe(true);
    expect(access.props!.value).toBe("supervised");
    await act(async () => current().onSave!());
    expect(fixture.command).toHaveBeenCalledWith(expect.objectContaining({ type: "configure", runtimeMode: "supervised", model: "model" }));
  } finally {
    fixture.accounts = [{ id: "default", label: "Default account", color: "fixture" }];
  }
});

it("opens the same sheet when another entry point requests it for this conversation", async () => {
  await render();
  expect(current().visible).toBe(false);
  await act(async () => openModelSheet("other", "session"));
  expect(current().visible).toBe(false);
  await act(async () => openModelSheet("machine", "session"));
  expect(current().visible).toBe(true);
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
