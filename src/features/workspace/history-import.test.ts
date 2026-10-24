// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { HistoryImport } from "./history-import";
const f = vi.hoisted(() => ({
  activeId: "machine",
  raw: null as string | null,
  scans: vi.fn(),
  send: vi.fn(async () => ({ state: "running" })),
  confirmation: null as (() => void) | null,
}));
const preview = {
  reviewId: "review",
  digest: "a".repeat(64),
  expiresAt: Date.now() + 300000,
  environmentId: "env",
  sourceSessionId: "source",
  omitted: 0,
  candidates: [
    {
      id: "candidate",
      provider: "codex",
      prompt: "Example history",
      startedAt: 1,
      lastAt: 2,
      sizeBytes: 100,
      resumable: true,
      kind: "interactive",
      imported: false,
    },
  ],
};
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "operation" }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => f.raw,
    setItem: async (_key: string, value: string) => {
      f.raw = value;
    },
    removeItem: async () => {
      f.raw = null;
    },
  },
}));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({
    id: "machine",
    name: "Computer",
    environmentId: "env",
    capabilities: ["history.import.desktop.v1"],
  }),
  useMachines: {
    getState: () => ({ activeId: f.activeId, machines: [{ id: "machine", environmentId: "env" }] }),
  },
}));
vi.mock("@/state/queries", () => ({
  useHostMutation: () => ({ mutateAsync: f.send }),
  useHostQuery: (key: string[]) =>
    key[0] === "history-import-preview"
      ? {
          refetch: async () => {
            f.scans();
            return { data: preview };
          },
          isFetching: false,
        }
      : {
          data: undefined,
          refetch: async () => ({ data: { state: "unknown" } }),
          isFetching: false,
        },
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({
  confirmAction: (_a: string, _b: string, _c: string, action: () => void) => {
    f.confirmation = action;
  },
}));
vi.mock("@/ui/primitives", () => {
  const box = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Body: box,
    Sheet: ({ children, footer }: PropsWithChildren<{ footer: unknown }>) =>
      createElement("div", null, children, footer as never),
    Notice: ({ message }: { message: string }) => createElement("p", null, message),
    QueryState: () => null,
    ErrorText: () => null,
    ScreenList: ({
      data,
      header,
      renderItem,
    }: {
      data: unknown[];
      header: unknown;
      renderItem: (input: { item: unknown }) => unknown;
    }) =>
      createElement(
        "div",
        null,
        header as never,
        ...data.map((item) => renderItem({ item }) as never),
      ),
    Button: ({
      label,
      disabled,
      onPress,
    }: {
      label: string;
      disabled: boolean;
      onPress: () => void;
    }) => createElement("button", { disabled, onClick: onPress }, label),
    ToggleField: ({
      label,
      disabled,
      value,
      onChange,
    }: {
      label: string;
      disabled: boolean;
      value: boolean;
      onChange: (value: boolean) => void;
    }) => createElement("button", { disabled, onClick: () => onChange(!value) }, label),
  };
});
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(HistoryImport, {
        scope: { machineId: "machine", sessionId: "source" },
        projectId: "project",
        onClose: vi.fn(),
      }),
    ),
  );
}
async function click(label: string) {
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === label)!
      .click(),
  );
}
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  f.raw = null;
  f.confirmation = null;
  f.activeId = "machine";
});
it("opens without scanning; explicit review and confirmation persist one receipt before one import", async () => {
  await mount();
  expect(f.scans).not.toHaveBeenCalled();
  expect(f.send).not.toHaveBeenCalled();
  await click("Scan this project's history");
  await click("Example history");
  await click("Import history");
  expect(f.send).not.toHaveBeenCalled();
  await act(async () => f.confirmation!());
  expect(f.raw).toContain('"operationId":"operation"');
  expect(f.send).toHaveBeenCalledExactlyOnceWith({
    projectId: "project",
    sessionId: "source",
    reviewId: "review",
    digest: "a".repeat(64),
    candidateIds: ["candidate"],
    operationId: "operation",
  });
  await click("Import history");
  expect(f.send).toHaveBeenCalledTimes(1);
});
it("reopening a durable unknown attempt never scans or resends and exposes only status recovery", async () => {
  f.raw = JSON.stringify({ operationId: "previous", digest: "a".repeat(64), environmentId: "env" });
  await mount();
  expect(f.scans).not.toHaveBeenCalled();
  expect(f.send).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Check import status");
  expect(
    [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Import history",
    )?.disabled,
  ).toBe(true);
});
it("a delayed confirmation after changing computers cannot create or send an attempt", async () => {
  await mount();
  await click("Scan this project's history");
  await click("Example history");
  await click("Import history");
  f.activeId = "other";
  await act(async () => f.confirmation!());
  expect(f.raw).toBeNull();
  expect(f.send).not.toHaveBeenCalled();
});
