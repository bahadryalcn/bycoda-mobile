// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), confirm: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: fixture.read, setItem: fixture.write },
}));
vi.mock("@/i18n", () => ({ useLocale: () => "tr" }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "new-template" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/tokens", () => ({ space: {} }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: { accent: "#000" } }) }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("@/ui/confirm", () => ({ confirmAction: fixture.confirm }));
vi.mock("@/features/workspace/desktop-preferences", () => ({ DesktopPreferences: () => null }));
vi.mock("react-native", () => ({
  ScrollView: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
vi.mock("@/state/actions", async () => {
  const { useState } = await import("react");
  return {
    useAsyncAction: () => {
      const [isPending, setPending] = useState(false);
      return {
        isPending,
        run: async (work: () => Promise<unknown>) => {
          setPending(true);
          try {
            return await work();
          } finally {
            setPending(false);
          }
        },
      };
    },
  };
});
vi.mock("@/ui/search-field", () => ({
  SearchToolbar: ({ search, actions }: { search: unknown; actions: unknown }) =>
    createElement("div", null, search as never, actions as never),
}));
vi.mock("@/ui/screen-list", () => ({
  ScreenList: ({ header, data, renderItem, ListEmptyComponent }: any) =>
    createElement(
      "div",
      null,
      header,
      ...data.map((item: unknown) => renderItem({ item })),
      data.length ? null : (ListEmptyComponent ?? null),
    ),
}));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled, busy }: any) =>
    createElement("button", { onClick: onPress, disabled: disabled || busy }, label);
  const Field = ({ label, value, onChangeText, editable, error, ref }: any) =>
    createElement(
      "label",
      null,
      label,
      createElement("input", {
        "aria-label": label,
        value,
        ref,
        disabled: editable === false,
        onChange: (event: any) => onChangeText(event.target.value),
      }),
      error,
    );
  const IconButton = ({ label, onPress, disabled }: any) =>
    createElement(Button, { label, onPress, disabled });
  return {
    Body: Wrap,
    Stack: Wrap,
    Row: Wrap,
    Section: Wrap,
    Badge: () => null,
    IconButton,
    Field,
    SearchField: Field,
    Button,
    Loading: () => createElement("p", null, "Loading"),
    NavigationRow: ({ detail, ...props }: any) =>
      createElement(
        "div",
        null,
        createElement(Button, props),
        createElement("p", { "data-preview": true }, detail),
      ),
    Notice: ({ message }: any) => createElement("p", null, message),
    ErrorText: ({ error }: any) =>
      error ? createElement("p", { role: "alert" }, error.message) : null,
    Empty: ({ title, action }: any) =>
      createElement(
        "div",
        null,
        title,
        action ? createElement(Button, { label: action.label, onPress: action.onPress }) : null,
      ),
    ErrorNotice: ({ error, onRetry, retryLabel, retrying }: any) =>
      error
        ? createElement(
            "div",
            null,
            error.message,
            onRetry
              ? createElement(Button, { label: retryLabel, onPress: onRetry, busy: retrying })
              : null,
          )
        : null,
    ActionMenu: ({ actions }: any) =>
      createElement(
        "div",
        null,
        ...actions.map((action: any) => createElement(Button, { ...action, key: action.key })),
      ),
    FormActions: ({
      feedback,
      submitLabel,
      onSubmit,
      onCancel,
      disabled,
      busy,
      cancelDisabled,
    }: any) =>
      createElement(
        "div",
        null,
        feedback,
        createElement(Button, { label: submitLabel, onPress: onSubmit, disabled, busy }),
        createElement(Button, {
          label: "Cancel",
          onPress: onCancel,
          disabled: cancelDisabled || busy,
        }),
      ),
  };
});
import { useTemplates } from "./template-store";
import { TemplateEditor } from "./template-editor";
import { TemplateLibrary } from "./template-library";
// Match the canonical property order produced by normalizeTemplates/storage hydration.
const initial = {
  id: "one",
  name: "Review",
  body: "Inspect the selected changes",
  trigger: "review",
};
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
const close = vi.fn(),
  insert = vi.fn();
function button(label: string) {
  return [...container.querySelectorAll("button")].find((button) => button.textContent === label)!;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function field(label: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(
      input,
      value,
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function editor() {
  await act(async () =>
    root.render(createElement(TemplateEditor, { initial, onClose: close, onInsert: insert })),
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.read.mockResolvedValue(JSON.stringify([initial]));
  fixture.write.mockResolvedValue(undefined);
  useTemplates.setState({ rows: [initial], hydrated: true, error: null, saving: false });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("recovers a failed local write by reading storage without discarding the editor draft", async () => {
  fixture.write.mockRejectedValueOnce(new Error("Storage unavailable"));
  await editor();
  await field("Template name", "My revised template");
  await click("Save template");
  expect(container.textContent).toContain("Storage unavailable");
  expect(close).not.toHaveBeenCalled();
  expect(button("Save template").disabled).toBe(true);
  await click("Reload templates");
  expect(
    container.querySelector<HTMLInputElement>('input[aria-label="Template name"]')!.value,
  ).toBe("My revised template");
  expect(button("Save template").disabled).toBe(false);
  await click("Save template");
  expect(fixture.write).toHaveBeenCalledTimes(2);
  expect(useTemplates.getState().rows[0].name).toBe("My revised template");
  expect(close).toHaveBeenCalledOnce();
});
it("keeps a conflicted draft readable and blocks write, delete and stale insertion after reconciliation", async () => {
  fixture.write.mockRejectedValueOnce(new Error("Uncertain write"));
  await editor();
  await field("Template name", "Keep this draft");
  await click("Save template");
  fixture.read.mockResolvedValueOnce(JSON.stringify([{ ...initial, body: "Changed elsewhere" }]));
  await click("Reload templates");
  expect(container.textContent).toContain("Templates changed. Keep your draft");
  expect(
    container.querySelector<HTMLInputElement>('input[aria-label="Template name"]')!.value,
  ).toBe("Keep this draft");
  for (const label of ["Save template", "Delete template", "Insert into message"])
    expect(button(label).disabled).toBe(true);
  expect(fixture.write).toHaveBeenCalledOnce();
  expect(close).not.toHaveBeenCalled();
  expect(insert).not.toHaveBeenCalled();
});
it("shows trigger validation, guards dirty dismissal and confirms deletion before changing storage", async () => {
  await editor();
  await field("Template trigger", "bad trigger");
  expect(container.textContent).toContain("Use a unique trigger");
  expect(button("Save template").disabled).toBe(true);
  await click("Cancel");
  expect(close).not.toHaveBeenCalled();
  expect(fixture.confirm).toHaveBeenCalled();
  await click("Delete template");
  expect(fixture.write).not.toHaveBeenCalled();
  expect(fixture.confirm.mock.calls.at(-1)![0]).toBe("Delete template");
});
it("inserts only an unchanged template and does not write or send anything on render", async () => {
  await editor();
  expect(insert).not.toHaveBeenCalled();
  expect(fixture.write).not.toHaveBeenCalled();
  await click("Insert into message");
  expect(insert).toHaveBeenCalledOnce();
  await field("Template text", "Unsaved body");
  expect(button("Insert into message").disabled).toBe(true);
});
it("searches name, trigger and body, retains search after closing a pristine editor and provides empty-filter recovery", async () => {
  await act(async () =>
    root.render(createElement(TemplateLibrary, { onClose: close, onInsert: insert })),
  );
  await field("Search template names, triggers and text", "selected changes");
  expect(button("Review")).toBeDefined();
  await click("Review");
  await click("Cancel");
  expect(
    container.querySelector<HTMLInputElement>(
      'input[aria-label="Search template names, triggers and text"]',
    )!.value,
  ).toBe("selected changes");
  await field("Search template names, triggers and text", "no match 123");
  expect(container.textContent).toContain("No matching results");
  await click("Clear search");
  expect(document.activeElement).toBe(
    container.querySelector('input[aria-label="Search template names, triggers and text"]'),
  );
  expect(button("Review")).toBeDefined();
});

it.each([
  "The message is too long.",
  "This conversation is not available for insertion. Your draft is unchanged.",
])("keeps the selected template open after insertion is refused: %s", async (message) => {
  insert.mockImplementationOnce(() => {
    throw new Error(message);
  });
  await act(async () =>
    root.render(createElement(TemplateLibrary, { onClose: close, onInsert: insert })),
  );
  await click("Review");
  await click("Insert into message");
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(message);
  expect(
    container.querySelector<HTMLInputElement>('input[aria-label="Template text"]')!.value,
  ).toBe(initial.body);
  expect(close).not.toHaveBeenCalled();
  expect(fixture.write).not.toHaveBeenCalled();
  await click("Insert into message");
  expect(insert).toHaveBeenNthCalledWith(2, initial.body);
  expect(close).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it("retires a pending phone-template deletion when its editor is closed", async () => {
  await act(async () =>
    root.render(createElement(TemplateLibrary, { onClose: close, onInsert: insert })),
  );
  await click("Review");
  await click("Delete template");
  const confirm = fixture.confirm.mock.calls.at(-1)![3];
  await click("Cancel");
  await act(async () => confirm());
  expect(fixture.write).not.toHaveBeenCalled();
  expect(useTemplates.getState().rows).toEqual([initial]);
  expect(button("Review")).toBeDefined();
});

it("matches Turkish template names and body without writing or inserting", async () => {
  const lower = String.prototype.toLocaleLowerCase;
  vi.spyOn(String.prototype, "toLocaleLowerCase").mockImplementation(function (
    this: string,
    locale,
  ) {
    return lower.call(this, locale ?? "en");
  });
  const rows = [
    { id: "istanbul", name: "İSTANBUL incelemesi", body: "Eksik bilgi kontrolü" },
    { id: "igdir", name: "IĞDIR kaydı", body: "📎 Dosyaları incele" },
  ];
  useTemplates.setState({ rows });
  await act(async () =>
    root.render(createElement(TemplateLibrary, { onClose: close, onInsert: insert })),
  );
  await field("Search template names, triggers and text", "istanbul");
  expect(button(rows[0].name)).toBeDefined();
  await field("Search template names, triggers and text", "ığdır");
  expect(button(rows[1].name)).toBeDefined();
  expect(fixture.write).not.toHaveBeenCalled();
  expect(insert).not.toHaveBeenCalled();
});

it("keeps family emoji intact at the preview limit without changing the stored prompt", async () => {
  const family = "👩‍👩‍👧‍👦";
  const body = "x".repeat(398) + family + "tail";
  useTemplates.setState({ rows: [{ ...initial, body }] });
  await act(async () =>
    root.render(createElement(TemplateLibrary, { onClose: close, onInsert: insert })),
  );
  expect(container.querySelector("[data-preview]")?.textContent).toBe(
    "x".repeat(398) + family + "…",
  );
  expect(useTemplates.getState().rows[0].body).toBe(body);
  expect(fixture.write).not.toHaveBeenCalled();
  expect(insert).not.toHaveBeenCalled();
});
