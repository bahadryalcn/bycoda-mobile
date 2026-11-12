// @vitest-environment happy-dom
import { act, createElement, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DesktopPreferences } from "./desktop-preferences";
const f = vi.hoisted(() => ({
  activeId: "machine",
  machineName: "Computer",
  endpoint: "https://computer.test",
  lanKey: "paired-key",
  private: false,
  raw: null as string | null,
  sends: [] as Record<string, unknown>[],
  details: 0,
  confirmations: [] as Array<{ title: string; detail: string; confirm: () => void }>,
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
    name: f.machineName,
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
vi.mock("@/ui/confirm", () => ({ confirmAction: (title: string, detail: string, _label: string, confirm: () => void) => f.confirmations.push({ title, detail, confirm }) }));
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
    Row: box,
    NavigationGroup: box,
    Sheet: ({
      children,
      visible,
      footer,
      title,
    }: PropsWithChildren<{ visible: boolean; footer: unknown; title: string }>) =>
      visible ? createElement("div", { role: "dialog", "aria-label": title }, children, footer as never) : null,
    Disclosure: ({ label, children }: PropsWithChildren<{ label: string }>) => {
      const [open, setOpen] = useState(false);
      return createElement("div", null, createElement("button", { onClick: () => setOpen(!open), "aria-expanded": open }, label), open ? children : null);
    },
    Notice: ({ message }: { message: string }) => createElement("p", null, message), StateView: ({ title }: { title: string }) => createElement("p", null, title),
    QueryState: () => null,
    ErrorText: ({ error }: { error: Error | null }) => error ? createElement("p", { role: "alert" }, error.message) : null,
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
    ActionMenu: ({ actions }: { actions: Array<{ key: string; label: string; disabled: boolean; onPress: () => void }> }) =>
      createElement("div", null, ...actions.map((action) => createElement(button, { ...action, key: action.key }))),
    NavigationRow: button,
    FormActions: ({
      submitLabel,
      disabled,
      onSubmit,
      feedback,
    }: {
      submitLabel: string;
      disabled: boolean;
      onSubmit: () => void;
      feedback: unknown;
    }) => createElement("div", null, feedback as never, button({ label: submitLabel, disabled, onPress: onSubmit })),
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
  document.body.append(container);
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
  container.remove();
  vi.unstubAllGlobals();
  f.raw = null;
  f.sends = [];
  f.activeId = "machine";
  f.machineName = "Computer";
  f.endpoint = "https://computer.test";
  f.lanKey = "paired-key";
  f.private = false;
  f.details = 0;
  insert.mockClear();
  props.onClose.mockClear();
  f.confirmations = [];
  f.snapshot = { ...f.snapshot, revision: "a".repeat(64), projectCwd: "/project", workingCwd: "/checkout" };
});

it("shows the captured computer/project inside the editor and preserves its fields through path disclosure and polling", async () => {
  await mount(); await click("One");
  const editor = container.querySelector('[role="dialog"][aria-label="Computer template"]')!;
  const field = editor.querySelector<HTMLInputElement>('input[aria-label="Template text"]')!;
  const context = [...editor.querySelectorAll("button")].find((button) => button.textContent === "Computer · project")!;
  expect(context).toBeDefined(); expect(editor.textContent).not.toContain("/checkout");
  await act(async () => context.click());
  expect(editor.textContent).toContain("Project: /project"); expect(editor.textContent).toContain("Working directory: /checkout");
  field.focus(); field.setSelectionRange(2, 7);
  f.snapshot = { ...f.snapshot, workingCwd: "/checkout-renamed" };
  await act(async () => root.render(createElement(DesktopPreferences, props)));
  expect(editor.querySelector('input[aria-label="Template text"]')).toBe(field);
  expect(field.value).toBe("Text {{cursor}}"); expect(context.getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(field); expect(field.selectionStart).toBe(2); expect(field.selectionEnd).toBe(7);
  expect(editor.textContent).toContain("Working directory: /checkout-renamed");
  expect(f.sends).toEqual([]); expect(f.raw).toBeNull();
});

it.each(["privacy", "machine"])("removes disclosed project paths on %s loss and keeps the opening computer identity", async (change) => {
  await mount(); await click("One");
  const editor = container.querySelector('[role="dialog"][aria-label="Computer template"]')!;
  await act(async () => [...editor.querySelectorAll("button")].find((button) => button.textContent === "Computer · project")!.click());
  if (change === "privacy") f.private = true; else f.activeId = "other";
  f.machineName = "Another computer";
  await act(async () => root.render(createElement(DesktopPreferences, props)));
  expect(container.textContent).not.toContain("/project"); expect(container.textContent).not.toContain("/checkout");
  expect(container.textContent).not.toContain("Another computer"); expect(container.textContent).toContain("Computer");
  expect(container.querySelector("input")).toBeNull(); expect(f.sends).toEqual([]); expect(f.raw).toBeNull();
});

it("confirms the named computer template before claiming and sending its exact reviewed deletion", async () => {
  await mount(); await click("One"); await click("Delete template");
  expect(f.sends).toEqual([]); expect(f.raw).toBeNull();
  expect(f.confirmations[0]).toMatchObject({ title: "Delete template", detail: "One" });
  await act(async () => f.confirmations[0].confirm());
  expect(f.sends).toHaveLength(1);
  expect(f.sends[0]).toMatchObject({ projectId: "project", sessionId: "source", expectedRevision: "a".repeat(64),
    operationId: "operation", change: { kind: "templateDelete", templateId: "one" } });
  expect(f.raw).toBeNull();
});

it("does not claim or send a confirmed deletion after the reviewed machine changes", async () => {
  await mount(); await click("One"); await click("Delete template");
  f.activeId = "other";
  await act(async () => f.confirmations[0].confirm());
  expect(f.sends).toEqual([]); expect(f.raw).toBeNull();
});

it("keeps the computer draft and retires pending deletion when the template snapshot changes", async () => {
  await mount(); await click("One"); await click("Delete template");
  f.snapshot = { ...f.snapshot, revision: "b".repeat(64) };
  await act(async () => root.render(createElement(DesktopPreferences, props)));
  expect(container.textContent).toContain("Templates changed. Keep your draft");
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Template text"]')!.value).toBe("Text {{cursor}}");
  for (const label of ["Save template", "Delete template", "Insert into message"])
    expect([...container.querySelectorAll("button")].find((button) => button.textContent === label)?.disabled).toBe(true);
  await act(async () => f.confirmations[0].confirm());
  expect(f.sends).toEqual([]); expect(f.raw).toBeNull();
});

it("keeps the computer template editor and body available when the composer refuses insertion", async () => {
  insert.mockImplementationOnce(() => { throw new Error("The message is too long."); });
  await mount(); await click("One"); await click("Insert into message");
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("The message is too long.");
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Template text"]')!.value).toBe("Text {{cursor}}");
  expect(props.onClose).not.toHaveBeenCalled(); expect(f.sends).toEqual([]);
  await click("Insert into message");
  expect(props.onClose).toHaveBeenCalledOnce(); expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(f.sends).toEqual([]);
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
