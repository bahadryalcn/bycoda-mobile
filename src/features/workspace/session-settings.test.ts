// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HostSession } from "./wire";

const fixture = vi.hoisted(() => ({
  command: vi.fn(async (_input: unknown): Promise<unknown> => undefined),
  update: vi.fn(async (_input: unknown): Promise<unknown> => undefined),
  discard: undefined as undefined | (() => void),
  machineId: "machine-a",
  close: undefined as undefined | (() => void),
  title: undefined as
    | undefined
    | { value: string; onChangeText(value: string): void; onBlur(): void },
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
  }),
}));
vi.mock("@/state/queries", () => ({
  useHostMutation: () => ({ mutateAsync: fixture.update, isPending: false }),
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Row: Group,
    Section: Group,
    NavigationGroup: Group,
    NavigationRow: ({ label, detail, disabled, onPress }: { label: string; detail?: string; disabled?: boolean; onPress(): void }) =>
      createElement("button", { disabled, onClick: onPress, title: detail }, label),
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
const openModel = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  fixture.command.mockReset().mockResolvedValue(undefined);
  fixture.update.mockReset().mockResolvedValue(undefined);
  fixture.storage.clear();
  fixture.machineId = "machine-a";
  fixture.title = undefined;
  close.mockClear();
  openModel.mockClear();
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
      providerAccountId: undefined,
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
          onOpenModel: openModel,
        }),
      ),
    ),
  );
}

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
it("keeps title edits local through timer, blur and close, then submits once on Save", async () => {
  await render();
  await act(async () => fixture.title!.onChangeText("Draft title"));
  await flush();
  await act(async () => fixture.title!.onBlur?.());
  await act(async () => fixture.close!());
  expect(fixture.update).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  await save();
  expect(fixture.command).not.toHaveBeenCalled();
  expect(fixture.update).toHaveBeenCalledOnce();
  expect(fixture.update).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Draft title", authorityGeneration: 3 }),
  );
  expect(close).toHaveBeenCalledOnce();
});

it("has one editor for model and access: the row closes settings and opens the shared model sheet", async () => {
  await render();
  const row = () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Model and access")!;
  expect(row().title).toBe("original");
  expect(container.textContent).not.toContain("Compact context");
  await act(async () => fixture.title!.onChangeText("Unsaved"));
  expect(row().disabled).toBe(true);
  await act(async () => fixture.title!.onChangeText("Original title"));
  await act(async () => row().click());
  expect(close).toHaveBeenCalledOnce();
  expect(openModel).toHaveBeenCalledOnce();
  expect(fixture.command).not.toHaveBeenCalled();
});

it("restores an unsaved title after unmount without a Host write", async () => {
  await render();
  await act(async () => fixture.title!.onChangeText("Retained draft"));
  await act(async () => root.unmount());
  root = createRoot(container);
  await render();
  expect(fixture.title!.value).toBe("Retained draft");
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

it("retains a failed title for explicit Save retry", async () => {
  fixture.update.mockRejectedValueOnce(new Error("Title refused"));
  await render();
  await act(async () => fixture.title!.onChangeText("Retained title"));
  await save();
  expect(close).not.toHaveBeenCalled();
  expect(fixture.update).toHaveBeenCalledOnce();
  await save();
  expect(fixture.update).toHaveBeenCalledTimes(2);
  expect(close).toHaveBeenCalledOnce();
});

it("blocks a restored title draft after the session authority changed", async () => {
  await render();
  await act(async () => fixture.title!.onChangeText("Stale"));
  await act(async () => root.unmount());
  root = createRoot(container);
  await render({ generation: 4 });
  expect(fixture.title!.value).toBe("Stale");
  await save();
  expect(fixture.update).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Session changed.");
});

it("blocks Save after the active computer changes", async () => {
  await render();
  await act(async () => fixture.title!.onChangeText("Other"));
  fixture.machineId = "machine-b";
  await render();
  await save();
  expect(fixture.update).not.toHaveBeenCalled();
});
