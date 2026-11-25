// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ log: vi.fn(), replace: vi.fn(), broken: true }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: ({ children }: PropsWithChildren) => h("main", null, children) }));
vi.mock("expo-router", () => ({ router: { replace: fixture.replace } }));
vi.mock("./copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./theme", () => ({ useMobileTheme: () => ({ colors: { background: "bg" } }) }));
vi.mock("../features/diagnostics/diagnostic-log", () => ({ logDiagnostic: fixture.log }));
type Action = { label: string; onPress: () => void };
vi.mock("./state-view", () => ({
  StateView: ({ title, size, action, secondaryAction }: { title: string; size: string; action?: Action; secondaryAction?: Action }) =>
    h("section", { "data-size": size }, title, ...[action, secondaryAction].filter(Boolean).map((item) => h("button", { key: item!.label, onClick: item!.onPress }, item!.label))),
}));
import { AppErrorScreen, SectionErrorBoundary } from "./error-boundary";

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  fixture.log.mockClear(); fixture.replace.mockClear(); fixture.broken = true;
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const click = (label: string) => act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click());

function Fragile() {
  if (fixture.broken) throw new Error("Bad row");
  return h("p", null, "Recovered body");
}

it("replaces one broken block with a compact state and remounts it on Try again", async () => {
  await act(async () => root.render(h("div", null, h("h1", null, "Sheet title"), h(SectionErrorBoundary, { scope: "sheet" }, h(Fragile)))));
  expect(container.textContent).toContain("Sheet title");
  expect(container.querySelector("section")?.getAttribute("data-size")).toBe("compact");
  expect(fixture.log).toHaveBeenCalledWith("error", "mobile.render", "render failed", expect.objectContaining({ scope: "sheet", name: "Error", message: "Bad row" }));
  fixture.broken = false;
  await click("Try again");
  expect(container.textContent).toContain("Recovered body");
});

it("offers a compact app recovery screen with Try again and Go to projects", async () => {
  const retry = vi.fn(async () => undefined);
  await act(async () => root.render(h(AppErrorScreen, { error: new Error("Boom"), retry })));
  expect(container.querySelector("section")?.getAttribute("data-size")).toBe("region");
  expect(container.textContent).toContain("Something went wrong");
  await click("Try again");
  expect(retry).toHaveBeenCalledOnce();
  await click("Go to projects");
  expect(fixture.replace).toHaveBeenCalledWith("/");
  expect(retry).toHaveBeenCalledTimes(2);
  expect(fixture.log).toHaveBeenCalledWith("error", "mobile.render", "render failed", expect.objectContaining({ scope: "app" }));
});
