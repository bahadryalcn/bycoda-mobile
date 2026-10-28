// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { FileReview } from "./file-review";

const state = vi.hoisted(() => ({ machine: { id: "machine-a" }, text: "const answer = 42;\n", draft: { expected: "before", content: "preserved local work" } as { expected: string; content: string } | null, active: true, methods: [] as string[] }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => state.machine }));
vi.mock("@/state/queries", () => ({
  useHostClient: () => ({ request: vi.fn() }), useHostReadActive: () => state.active,
  useHostQuery: (_key: unknown, method: string) => { state.methods.push(method); return { data: state.text, isSuccess: true }; },
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: state.draft, isError: false }) }));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: { getItem: vi.fn() } }));
vi.mock("expo-router", () => ({ useFocusEffect: () => undefined }));
vi.mock("react-native", () => ({
  BackHandler: {}, useWindowDimensions: () => ({ width: 320 }),
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
  ScrollView: ({ children }: PropsWithChildren) => createElement("div", null, children),
  FlatList: ({ data, renderItem }: { data: { number: number; text: string }[]; renderItem: (value: { item: { number: number; text: string } }) => unknown }) => createElement("div", null, data.map((item) => createElement("div", { key: item.number }, renderItem({ item }) as import("react").ReactNode))),
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => null }));
vi.mock("@/ui/tokens", () => ({ colors: {}, space: { screen: 16 } }));
vi.mock("@/ui/styles", () => ({ uiStyles: { mono: { fontSize: 13, lineHeight: 20 } } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/document-preview", () => ({
  DocumentPreview: ({ text }: { text: string }) => createElement("article", null, text),
  ProjectMedia: ({ path }: { path: string }) => createElement("article", { "data-media": true }, path),
}));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Wrapper, CodeText: ({ children, selectable }: PropsWithChildren<{ selectable?: boolean }>) => createElement("span", { "data-code": true, "data-selectable": selectable !== false }, children), Row: Wrapper, Screen: Wrapper, ErrorText: () => null, QueryState: () => null,
    Notice: ({ message }: { message: string }) => createElement("p", null, message),
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label),
    SegmentedControl: ({ options, onChange }: { options: { value: string; label: string }[]; onChange: (value: string) => void }) => createElement("div", null, options.map((option) => createElement("button", { key: option.value, onClick: () => onChange(option.value) }, option.label))),
  };
});
let root: ReturnType<typeof createRoot>;
const container = document.createElement("div");
const onBack = vi.fn();
async function render(path = "src/example.ts") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root ??= createRoot(container);
  await act(async () => root.render(createElement(FileReview, { projectId: "project", cwd: "/checkout", path, onBack })));
}
afterEach(async () => { await act(async () => root?.unmount()); state.machine = { id: "machine-a" }; state.text = "const answer = 42;\n"; state.draft = { expected: "before", content: "preserved local work" }; state.active = true; state.methods = []; vi.unstubAllGlobals(); });

it("opens computer source read-only while preserving a separately labeled local draft", async () => {
  root = createRoot(container); await render();
  expect(container.textContent).toContain("src/example.ts");
  expect(container.textContent).toContain("/checkout");
  expect(container.textContent).toContain("Computer file · read only");
  expect(container.textContent).toContain("const answer = 42;");
  expect(container.textContent).not.toContain("preserved local work");
  expect(container.querySelector("input,textarea")).toBeNull();
  const labels = [...container.querySelectorAll("button")].map((button) => button.textContent);
  expect(labels).not.toContain("Edit");
  expect(labels).not.toContain("Save");
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Preserved draft")!.click());
  expect(container.textContent).toContain("Preserved draft · read only");
  expect(container.textContent).toContain("preserved local work");
  expect(container.textContent).not.toContain("const answer = 42;");
  expect(state.methods.every((method) => method === "files.read")).toBe(true);
});

it("resets local source on computer switch and hides draft content when inactive", async () => {
  root = createRoot(container); await render();
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Preserved draft")!.click());
  state.machine = { id: "machine-b" }; state.draft = null;
  await render();
  expect(container.textContent).toContain("Computer file · read only");
  expect(container.textContent).not.toContain("preserved local work");
  state.draft = { expected: "before", content: "private draft" }; state.active = false;
  await render();
  expect(container.textContent).not.toContain("Preserved draft");
  expect(container.textContent).not.toContain("private draft");
});

it("keeps media behind the existing preview and makes bounded text explicit", async () => {
  root = createRoot(container); state.draft = null; await render("image.png");
  expect(container.querySelector("[data-media]")).not.toBeNull();
  state.text = "x".repeat(3000); await render();
  expect(container.textContent).toContain("Preview limit reached.");
});

it("offers one selectable multiline source without numbers and keeps drafts read-only", async () => {
  root = createRoot(container);
  state.text = "# Başlık\r\n\r\n  ikinci satır\n\t界😀\n";
  await render("README.md");
  const click = async (label: string) => act(async () => {
    [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click();
  });
  await click("Select text");
  const source = [...container.querySelectorAll('[data-code][data-selectable="true"]')]
    .find((element) => element.textContent === "# Başlık\n\n  ikinci satır\n\t界😀\n");
  expect(source).toBeDefined();
  expect(source!.children).toHaveLength(0);
  expect(container.querySelector("input,textarea")).toBeNull();
  await click("Line view");
  expect(container.textContent).toContain("Select text");
  await click("Preserved draft");
  await click("Select text");
  expect(container.textContent).not.toContain("Başlık");
  expect(container.textContent).toContain("preserved local work");
  expect(state.methods.every((method) => method === "files.read")).toBe(true);
});
