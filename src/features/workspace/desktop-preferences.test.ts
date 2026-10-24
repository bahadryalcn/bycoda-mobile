// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DesktopPreferences } from "./desktop-preferences";
const f = vi.hoisted(() => ({
  activeId: "machine",
  endpoint: "https://computer.test",
  lanKey: "paired-key",
  private: false,
  raw: null as string | null,
  sends: [] as Record<string, unknown>[],
  details: 0,
  snapshot: {
    environmentId: "env",
    sourceSessionId: "source",
    projectCwd: "/project",
    workingCwd: "/checkout",
    revision: "a".repeat(64),
    atomic: false,
    templates: [{ id: "one", name: "One", preview: "Text" }],
    providers: [],
  } as Record<string, unknown>,
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
    environmentId: "env",
    name: "Computer",
    endpoint: "https://computer.test",
    lanKey: "paired-key",
    capabilities: ["preferences.desktop.v1"],
  }),
  useMachines: {
    getState: () => ({ activeId: f.activeId, machines: [{ id: "machine", environmentId: "env",endpoint:f.endpoint,lanKey:f.lanKey }] }),
  },
}));
vi.mock("@/state/queries", () => ({
  useHostMutation: (method: string) => ({
    mutateAsync: async (params: Record<string, unknown>) => {
      if (method === "preferences.desktop.template.read") {
        f.details++;
        return {
          revision: "a".repeat(64),
          template: { id: "one", name: "One", body: "Text {{cursor}}" },
        };
      }
      expect(f.raw).toContain('"operationId":"operation"');
      f.sends.push(params);
      return { state: "applied", snapshot: f.snapshot };
    },
  }),
  useHostQuery: (key: string[]) =>
    key[0] === "desktop-preferences"
      ? {
          data: f.snapshot,
          isError: f.private,
          error: f.private ? new Error("private") : null,
          refetch: async () => ({ data: f.snapshot }),
        }
      : { data: { state: "unknown" }, refetch: async () => ({ data: { state: "unknown" } }) },
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/sheet-guard", () => ({
  useSheetGuard: ({ onClose }: { onClose: () => void }) => ({ requestClose: onClose }),
}));
vi.mock("@/ui/primitives", () => {
  const box = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const button = ({
    label,
    disabled,
    onPress,
  }: {
    label: string;
    disabled: boolean;
    onPress: () => void;
  }) => createElement("button", { disabled, onClick: onPress }, label);
  return {
    Body: box,
    Stack: box,
    NavigationGroup: box,
    Sheet: ({
      children,
      visible,
      footer,
    }: PropsWithChildren<{ visible: boolean; footer: unknown }>) =>
      visible ? createElement("div", null, children, footer as never) : null,
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
    Button: button,
    NavigationRow: button,
    FormActions: ({
      submitLabel,
      disabled,
      onSubmit,
    }: {
      submitLabel: string;
      disabled: boolean;
      onSubmit: () => void;
    }) => button({ label: submitLabel, disabled, onPress: onSubmit }),
    Field: ({ label, value, editable }: { label: string; value: string; editable: boolean }) =>
      createElement("input", { "aria-label": label, value, readOnly: true, disabled: !editable }),
    SelectField: () => null,
  };
});
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
const insert = vi.fn();
const props = {
  scope: { machineId: "machine", sessionId: "source" },
  projectId: "project",
  onClose: vi.fn(),
  onInsert: insert,
};
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  await act(async () => root.render(createElement(DesktopPreferences, props)));
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
  vi.unstubAllGlobals();
  f.raw = null;
  f.sends = [];
  f.activeId = "machine";
  f.endpoint = "https://computer.test";
  f.lanKey = "paired-key";
  f.private = false;
  f.details = 0;
  insert.mockClear();
});
it("opening reads metadata only; explicit template selection reads body and inserts solely through the composer callback", async () => {
  await mount();
  expect(f.details).toBe(0);
  expect(f.sends).toEqual([]);
  await click("One");
  expect(f.details).toBe(1);
  await click("Insert into message");
  expect(insert).toHaveBeenCalledWith("Text {{cursor}}");
  expect(f.sends).toEqual([]);
});
it("an explicit template save claims a durable operation before the only canonical mutation", async () => {
  await mount();
  await click("One");
  await click("Save template");
  expect(f.sends).toHaveLength(1);
  expect(f.sends[0]).toMatchObject({
    sessionId: "source",
    operationId: "operation",
    change: { kind: "templateUpdate", templateId: "one", body: "Text {{cursor}}" },
  });
  expect(f.raw).toBeNull();
});
it("restored unknown receipt disables writes and never replays", async () => {
  f.raw = JSON.stringify({ operationId: "previous", environmentId: "env", digest: "a".repeat(64) });
  await mount();
  expect(container.textContent).toContain("Unknown operations are not sent again");
  expect(
    [...container.querySelectorAll("button")].find((button) => button.textContent === "One")
      ?.disabled,
  ).toBe(true);
  expect(f.sends).toEqual([]);
});
it("privacy errors hide open template body and switching computer cannot insert or save", async () => {
  await mount();
  await click("One");
  f.activeId = "other";
  await click("Insert into message");
  expect(insert).not.toHaveBeenCalled();
  expect(f.sends).toEqual([]);
  f.activeId = "machine";
  f.private = true;
  await act(async () => root.render(createElement(DesktopPreferences, props)));
  expect(container.querySelector("input")).toBeNull();
});
it("same saved machine ID cannot follow a re-paired endpoint or credential to save",async()=>{
 await mount();await click("One");f.endpoint="https://different.test";await click("Save template");expect(f.sends).toEqual([]);expect(f.raw).toBeNull();
 f.endpoint="https://computer.test";await act(async()=>root.render(createElement(DesktopPreferences,props)));f.lanKey="new-key";await click("Insert into message");expect(insert).not.toHaveBeenCalled();
});
