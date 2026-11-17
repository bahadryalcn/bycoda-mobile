// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSheetDismissal } from "@/ui/sheet-guard";
vi.mock("./clone-repository", () => ({ CloneRepositorySheet: () => null }));

const fixture = vi.hoisted(() => ({
  pending: false,
  error: null as Error | null,
  events: [] as string[],
  open: vi.fn(),
  query: vi.fn(),
  data: {
    path: "/work",
    parent: "/",
    home: "/work",
    roots: [],
    entries: Array.from({ length: 13 }, (_, i) => ({ name: `Folder ${i}`, path: `/work/${i}` })),
  },
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
vi.mock("expo-router", () => ({ router: { push: () => fixture.events.push("route") } }));
vi.mock("@/ui/theme", () => ({
  useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }),
}));
vi.mock("@/i18n", () => ({ useLocale: () => "tr" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("@/ui/tokens", () => ({ space: {}, colors: {} }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/ui/busy-indicator", () => ({ BusyIndicator: () => null }));
vi.mock("@/ui/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("lucide-react-native/icons/arrow-up", () => ({ default: () => null }));
vi.mock("./shared", () => ({
  rowInset: 16,
  GroupedListRow: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
vi.mock("@/state/queries", () => ({
  useHostQuery: (...args: unknown[]) => {
    fixture.query(...args);
    return { data: fixture.data, error: fixture.error, isFetching: false, isPending: false };
  },
}));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled, busy }: any) =>
    createElement("button", { onClick: onPress, disabled: disabled || busy }, label);
  return {
    Body: Group,
    Row: Group,
    Disclosure: Group,
    MutationState: () => null,
    Sheet: ({ children, footer, onClose, dirty }: any) => {
      const dismissal = useSheetDismissal({
        visible: true,
        dirty: !!dirty,
        pending: false,
        onClose,
      });
      return createElement(
        "section",
        null,
        createElement(Button, { label: "Close", onPress: dismissal.requestClose }),
        children,
        footer,
        dismissal.confirming
          ? createElement(Button, { label: "Confirm discard", onPress: dismissal.confirmClose })
          : null,
      );
    },
    ScreenList: ({ header, footer, data, renderItem }: any) =>
      createElement(
        "main",
        null,
        createElement("header", null, header),
        createElement(
          "section",
          null,
          data.map((item: unknown, index: number) =>
            createElement("div", { key: index }, renderItem({ item, index })),
          ),
        ),
        footer,
      ),
    Button,
    IconButton: Button,
    NavigationRow: Button,
    SelectField: () => null,
    SearchField: ({ label, value, onChangeText, ref }: any) =>
      createElement("input", {
        "aria-label": label,
        value,
        ref,
        onChange: (e: any) => onChangeText(e.target.value),
      }),
    IdentifierField: ({ label, value, onChangeText }: any) =>
      createElement("input", {
        "aria-label": label,
        value,
        onChange: (event: any) => onChangeText(event.target.value),
      }),
    QueryState: ({ query, empty, emptyTitle, emptyAction, onManageConnections }: any) =>
      query.error
        ? createElement(Button, { label: "Manage connections", onPress: onManageConnections })
        : empty
          ? createElement(
              "div",
              null,
              emptyTitle,
              emptyAction
                ? createElement(Button, { label: emptyAction.label, onPress: emptyAction.onPress })
                : null,
            )
          : null,
  };
});
import { ProjectFolderBrowser } from "./project-folder-browser";
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
const render = () =>
  act(() =>
    root.render(
      createElement(ProjectFolderBrowser, {
        onClose: () => fixture.events.push("close"),
        onOpen: fixture.open,
        mutation: { isPending: fixture.pending, isError: false, isSuccess: false, error: null },
      }),
    ),
  );
const click = async (label: string) => {
  const button = [...container.querySelectorAll("button")].find((b) => b.textContent === label);
  expect(button).toBeTruthy();
  await act(() => button!.click());
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.pending = false;
  fixture.error = null;
  fixture.events = [];
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("retains an entered folder path until discard is confirmed without opening it", async () => {
  await render();
  const input = container.querySelector<HTMLInputElement>('input[aria-label="Folder path"]')!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input,
      "/work/unsent-long-folder",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("Close");
  expect(fixture.events).toEqual([]);
  expect(input.value).toBe("/work/unsent-long-folder");
  expect(fixture.open).not.toHaveBeenCalled();
  await click("Confirm discard");
  expect(fixture.events).toEqual(["close"]);
  expect(fixture.open).not.toHaveBeenCalled();
});
it("restores the same folder collection without opening or navigating when clearing an empty search", async () => {
  await render();
  const input = container.querySelector("input")!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input,
      "missing",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(container.textContent).toContain("No folders match your search.");
  await click("Clear search");
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe("");
  expect(container.textContent).toContain("Folder 12");
  expect(fixture.open).not.toHaveBeenCalled();
  expect(fixture.events).toEqual([]);
  expect(
    fixture.query.mock.calls.every(
      (args) => args[1] === "projects.browse" && (args[2] as any).path === undefined,
    ),
  ).toBe(true);
});
it("closes the browser before connection repair and refuses the same repair during a pending open", async () => {
  fixture.error = new Error("Pairing needs repair");
  await render();
  await click("Manage connections");
  expect(fixture.events).toEqual(["close", "route"]);
  fixture.events = [];
  fixture.pending = true;
  await render();
  await click("Manage connections");
  await click("Close");
  expect(fixture.events).toEqual([]);
  expect(fixture.open).not.toHaveBeenCalled();
});

it("matches Turkish folder names without opening a project or changing the path", async () => {
  const lower = String.prototype.toLocaleLowerCase;
  vi.spyOn(String.prototype, "toLocaleLowerCase").mockImplementation(function (
    this: string,
    locale,
  ) {
    return lower.call(this, locale ?? "en");
  });
  const original = fixture.data.entries;
  fixture.data.entries = [
    { name: "İSTANBUL", path: "/work/istanbul" },
    { name: "IĞDIR", path: "/work/igdir" },
    ...original,
  ];
  try {
    await render();
    const input = container.querySelector("input")!;
    for (const [query, expected] of [
      ["istanbul", "İSTANBUL"],
      ["ığdır", "IĞDIR"],
    ]) {
      await act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          input,
          query,
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(container.textContent).toContain(expected);
    }
    expect(fixture.open).not.toHaveBeenCalled();
    expect(fixture.events).toEqual([]);
  } finally {
    fixture.data.entries = original;
  }
});

it("retains an active folder search when refreshed collection becomes short", async () => {
  const original = fixture.data.entries;
  try {
    await render();
    const input = container.querySelector("input")!;
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "missing",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    fixture.data.entries = [];
    await render();
    expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("missing");
    expect(fixture.open).not.toHaveBeenCalled();
  } finally {
    fixture.data.entries = original;
  }
});
