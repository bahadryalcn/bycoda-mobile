// @vitest-environment happy-dom
import { act, createElement, type ComponentProps, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentModelFields } from "./agent-model-fields";
import type { HostSession } from "./wire";

const fixture = vi.hoisted(() => ({
  command: vi.fn(async (_input: unknown): Promise<unknown> => undefined),
  update: vi.fn(async (_input: unknown): Promise<unknown> => undefined),
  discard: undefined as undefined | (() => void),
  machineId: "machine-a",
  switchAllowed: false,
  close: undefined as undefined | (() => void),
  model: undefined as undefined | ComponentProps<typeof AgentModelFields>,
  title: undefined as
    | undefined
    | { value: string; onChangeText(value: string): void; onBlur(): void },
  accountId: undefined as string | undefined,
  storage: new Map<string, string>(),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => fixture.storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      fixture.storage.set(key, value);
    },
    removeItem: async (key: string) => {
      fixture.storage.delete(key);
    },
  },
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({
    id: fixture.machineId,
    environmentId: "environment",
    providers: ["claude", "codex"],
    capabilities: fixture.switchAllowed ? ["sessions.harnessSwitch"] : [],
  }),
}));
vi.mock("@/state/queries", () => ({
  useHostMutation: () => ({ mutateAsync: fixture.update, isPending: false }),
}));
vi.mock("@/state/model-catalog", () => ({
  useModelCatalog: () => ({
    data: { accounts: { claude: [{ id: "default", label: "Personal" }] }, errors: {} },
  }),
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("./catalog", () => ({
  catalogProviders: () => ["claude", "codex"],
  sessionCatalog: () => ({
    models: {
      claude: [
        { id: "original", name: "Original" },
        { id: "new", name: "New" },
      ],
      codex: [{ id: "codex:new", name: "Codex new" }],
    },
  }),
  sessionModel: () => ({ id: "original" }),
  sessionSettings: (_model: unknown, value: unknown) => value,
  modelDefaults: () => ({}),
}));
vi.mock("./agent-model-fields", () => ({
  AgentModelFields: (props: ComponentProps<typeof AgentModelFields>) => {
    fixture.model = props;
    return null;
  },
}));
vi.mock("./agent-option-icons", () => ({ PermissionField: () => null }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Row: Group,
    Section: Group,
    FormActions: ({ onSubmit, disabled }: { onSubmit(): void; disabled?: boolean }) =>
      createElement("button", { disabled, onClick: onSubmit }, "Save"),
    Sheet: ({
      onClose,
      children,
      footer,
      dirty,
      dismissible,
    }: PropsWithChildren<{
      onClose(): void;
      footer?: import("react").ReactNode;
      dirty?: boolean;
      dismissible?: boolean;
    }>) => {
      fixture.close = () => {
        if (!dirty && dismissible !== false) onClose();
      };
      fixture.discard = () => {
        if (dismissible !== false) onClose();
      };
      return createElement(Group, null, children, footer);
    },
    Field: (props: NonNullable<typeof fixture.title>) => {
      fixture.title = props;
      return createElement("output", null, props.value);
    },
    Button: ({
      label,
      disabled,
      onPress,
    }: {
      label: string;
      disabled?: boolean;
      onPress(): void;
    }) => createElement("button", { disabled, onClick: onPress }, label),
    Notice: ({ message }: { message: string }) => createElement("p", null, message),
    QueryState: () => null,
    ErrorText: ({ error }: { error: Error }) => createElement("p", null, error.message),
    MutationState: ({ mutation }: { mutation: { error?: Error } }) =>
      mutation.error ? createElement("p", null, mutation.error.message) : null,
  };
});
import { SessionSettings } from "./session-settings";
let root: Root, container: HTMLDivElement, cache: QueryClient;
const close = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  fixture.command.mockReset().mockResolvedValue(undefined);
  fixture.update.mockReset().mockResolvedValue(undefined);
  fixture.storage.clear();
  fixture.machineId = "machine-a";
  fixture.switchAllowed = false;
  fixture.accountId = undefined;
  fixture.model = undefined;
  fixture.title = undefined;
  close.mockClear();
  container = document.createElement("div");
  root = createRoot(container);
  cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function render(
  overrides: { generation?: number; model?: string; status?: string; disabled?: boolean; settings?: Record<string, string> } = {},
) {
  const value = {
    projectId: "project",
    authorityGeneration: overrides.generation ?? 3,
    status: overrides.status ?? "idle",
    session: {
      id: "session",
      title: "Original title",
      harness: "claude",
      providerAccountId: fixture.accountId,
      model: overrides.model ?? "original",
      modelSettings: overrides.settings ?? {},
      runtimeMode: "supervised",
    },
  } as unknown as HostSession;
  await act(async () =>
    root.render(
      createElement(
        QueryClientProvider,
        { client: cache },
        createElement(SessionSettings, {
          value,
          projectId: "project",
          disabled: overrides.disabled ?? false,
          onClose: close,
          onCommand: fixture.command,
          onUpdated: () => {},
        }),
      ),
    ),
  );
}

it("keeps independent delegation and tool restrictions when changing provider in session settings", async () => {
  fixture.switchAllowed = true;
  const settings = { crossSubagents: "auto", crossAdvisor: "null", crossSubagentMaxEffort: "high", crewTools: "[]" };
  await render({ settings });
  await act(() => fixture.model!.provider!.onChange(fixture.model!.provider!.choices.find(choice => choice.provider === "codex")!));
  expect(fixture.model!.settings).toMatchObject(settings);
  expect(fixture.command).not.toHaveBeenCalled();
});
const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
const save = () =>
  act(async () => {
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Save")!
      .click();
  });
it("keeps edits local through timer, blur and close, then submits once on Save", async () => {
  await render();
  await act(async () => fixture.model!.onChange("new", { effort: "high" }));
  await act(async () => fixture.title!.onChangeText("Draft title"));
  await flush();
  await act(async () => fixture.title!.onBlur?.());
  await act(async () => fixture.close!());
  expect(fixture.command).not.toHaveBeenCalled();
  expect(fixture.update).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  await save();
  expect(fixture.command).toHaveBeenCalledOnce();
  expect(fixture.update).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Draft title", authorityGeneration: 3 }),
  );
});
it("retains failed configuration for explicit Save retry", async () => {
  fixture.command.mockRejectedValueOnce(new Error("Configuration refused"));
  await render();
  await act(async () => fixture.model!.onChange("new", { effort: "high" }));
  await save();
  await flush();
  expect(fixture.command).toHaveBeenCalledOnce();
  expect(fixture.model!.model).toBe("new");
  await flush();
  expect(fixture.command).toHaveBeenCalledOnce();
  await save();
  expect(fixture.command).toHaveBeenCalledTimes(2);
});
it("keeps removed accounts explicit until repaired and saved", async () => {
  fixture.accountId = "removed";
  await render();
  expect(fixture.model!.provider!.value!.label).toBe("Account unavailable");
  await act(async () => fixture.model!.provider!.onChange(fixture.model!.provider!.choices[0]!));
  await flush();
  expect(fixture.command).not.toHaveBeenCalled();
  await save();
  expect(fixture.command).toHaveBeenCalledWith(
    expect.objectContaining({ providerAccountId: null }),
  );
});

it("restores unsaved model, effort and title after unmount without a Host write", async () => {
  await render();
  await act(async () => fixture.model!.onChange("new", { effort: "high" }));
  await act(async () => fixture.title!.onChangeText("Retained draft"));
  await act(async () => root.unmount());
  root = createRoot(container);
  await render();
  expect(fixture.model!.model).toBe("new");
  expect(fixture.model!.settings).toEqual({ effort: "high" });
  expect(fixture.title!.value).toBe("Retained draft");
  expect(fixture.command).not.toHaveBeenCalled();
  expect(fixture.update).not.toHaveBeenCalled();
});

it("clears durable draft after an explicitly confirmed discard", async () => {
  await render();
  await act(async () => fixture.title!.onChangeText("Discard this"));
  await flush();
  expect(fixture.storage.size).toBe(1);
  await act(async () => fixture.discard!());
  expect(fixture.storage.size).toBe(0);
  expect(close).toHaveBeenCalledOnce();
  expect(fixture.update).not.toHaveBeenCalled();
});
it("blocks repeated Save and dismissal until configuration settles", async () => {
  let finish!: () => void;
  fixture.command.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => resolve(undefined);
      }),
  );
  await render();
  await act(async () => fixture.model!.onChange("new", {}));
  await save();
  await save();
  await act(async () => fixture.close!());
  expect(close).not.toHaveBeenCalled();
  expect(fixture.command).toHaveBeenCalledOnce();
  await act(async () => finish());
  expect(close).toHaveBeenCalledOnce();
  expect(fixture.storage.size).toBe(0);
});
it("retains partial-success title draft and retries only failed title RPC", async () => {
  fixture.update.mockRejectedValueOnce(new Error("Title refused"));
  await render();
  await act(async () => fixture.model!.onChange("new", {}));
  await act(async () => fixture.title!.onChangeText("Retained title"));
  await save();
  expect(close).not.toHaveBeenCalled();
  expect(fixture.command).toHaveBeenCalledOnce();
  expect(fixture.update).toHaveBeenCalledOnce();
  await save();
  expect(fixture.command).toHaveBeenCalledOnce();
  expect(fixture.update).toHaveBeenCalledTimes(2);
  expect(close).toHaveBeenCalledOnce();
});
it("preserves restored draft but blocks stale authority or changed Host model", async () => {
  await render();
  await act(async () => fixture.model!.onChange("new", {}));
  await act(async () => root.unmount());
  root = createRoot(container);
  await render({ generation: 4, model: "desktop-model" });
  expect(fixture.model!.model).toBe("new");
  await save();
  expect(fixture.command).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Session changed.");
});
it("blocks running and changed-machine configuration", async () => {
  await render();
  await act(async () => fixture.model!.onChange("new", {}));
  await render({ status: "running" });
  await save();
  expect(fixture.command).not.toHaveBeenCalled();
  fixture.machineId = "machine-b";
  await render();
  await save();
  expect(fixture.command).not.toHaveBeenCalled();
});
