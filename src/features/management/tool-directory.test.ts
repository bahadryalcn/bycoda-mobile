// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ activeId: "machine", epoch: 0, locale: "en", push: vi.fn(), selectProject: vi.fn(), clear: vi.fn(), capabilities: undefined as string[] | undefined }));
vi.mock("@/state/connection-scope", () => { const epochs = new Map<number, any>(); return { useConnectionScope: () => {
  const epoch = fixture.epoch; if (!epochs.has(epoch)) epochs.set(epoch, { token: String(epoch), isCurrent: () => fixture.epoch === epoch }); return epochs.get(epoch);
} }; });
vi.mock("expo-router", () => ({ router: { navigate: fixture.push } }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/tokens", () => ({ colors: {} }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (tr: string, en: string) => fixture.locale === "tr" ? tr : en }));
vi.mock("@/i18n", () => ({ useLocale: () => fixture.locale }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "machine", capabilities: fixture.capabilities }), useMachines: { getState: () => ({ activeId: fixture.activeId, selectProject: fixture.selectProject }) } }));
vi.mock("lucide-react-native/icons/folder-open", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/git-branch", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/message-square", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/messages-square", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/bot", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/megaphone", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/activity", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/plug", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/key-round", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/square-check-big", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/target", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/users", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/clock", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/notebook-pen", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/message-circle", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/inbox", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/laptop", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/shield-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/server", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/scroll-text", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/smartphone", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/globe", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/terminal", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chart-column", () => ({ default: () => null }));
vi.mock("../workspace/project-picker", async () => {
  const { useState } = await import("react");
  return { ProjectPicker: ({ onSelect }: any) => {
    const [value, setValue] = useState("");
    return createElement("aside", null, createElement("input", { "aria-label": "Picker search", value, onChange: (event: any) => setValue(event.target.value) }),
      createElement("button", { onClick: () => onSelect({ id: "project", name: "Project" }) }, "Choose project"));
  } };
});
vi.mock("@/ui/primitives", () => ({
  NavigationGroup: ({ children }: PropsWithChildren) => createElement("div", null, children),
  Section: ({ children, title }: PropsWithChildren<{ title: string }>) => createElement("section", null, createElement("h2", null, title), children),
  NavigationRow: ({ label, detail, onPress }: any) => createElement("div", null, createElement("button", { onClick: onPress }, label), detail),
  Empty: ({ title, action }: any) => createElement("div", null, title, action ? createElement("button", { onClick: action.onPress }, action.label) : null),
}));
import { ToolDirectory } from "./tool-directory";
it("opens the paired assistant without requiring or inventing a project",async()=>{
 await render("Assistant");await click("Assistant");expect(fixture.push).toHaveBeenCalledWith("/assistant");
});
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
async function render(query = "", projectId: string | null = null, extra: Partial<Parameters<typeof ToolDirectory>[0]> = {}) {
  await act(async () => root.render(createElement(ToolDirectory, { query, projectId, onClearSearch: fixture.clear, ...extra })));
}
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); fixture.activeId = "machine"; fixture.epoch = 0; fixture.locale = "en"; container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
it("offers clear recovery without empty headings and preserves an already-open picker/search through filtering", async () => {
  await render(); await click("Files");
  const field = container.querySelector("input")!;
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(field, "keep picker search"); field.dispatchEvent(new Event("input", { bubbles: true })); });
  await render("no matching tool 123"); expect(container.querySelectorAll("h2")).toHaveLength(0);
  expect(container.querySelector<HTMLInputElement>("input")!.value).toBe("keep picker search");
  await click("Clear search"); expect(fixture.clear).toHaveBeenCalledOnce();
  await click("Choose project"); expect(fixture.push).toHaveBeenCalledWith({ pathname: "/project/[id]", params: { id: "project", machineId: "machine", view: "files" } });
});
it("continues a project-local view without switching global project state or pushing a route", async () => {
  const onProjectView = vi.fn(); await render("", "project", { onProjectView }); await click("Files");
  expect(onProjectView).toHaveBeenCalledWith("files"); expect(fixture.push).not.toHaveBeenCalled(); expect(fixture.selectProject).not.toHaveBeenCalled();
});
it("retains deferred navigation and rejects it if the computer changes before approval", async () => {
  let navigate: (() => void) | undefined;
  await render("", "project", { onNavigate: (action) => { navigate = action; } }); await click("Browser");
  expect(fixture.push).not.toHaveBeenCalled(); fixture.activeId = "other"; navigate!();
  expect(fixture.push).not.toHaveBeenCalled(); expect(fixture.selectProject).not.toHaveBeenCalled();
});
it("rejects deferred navigation from a retired connection with the same computer ID", async () => {
  let navigate: (() => void) | undefined; await render("", "project", { onNavigate: action => { navigate = action; } }); await click("Browser");
  fixture.epoch++; navigate!(); expect(fixture.push).not.toHaveBeenCalled(); expect(fixture.selectProject).not.toHaveBeenCalled();
});
it("does not reopen a pending project picker across connection replacement", async () => {
  await render(); await click("Files"); expect(container.querySelector("aside")).not.toBeNull(); fixture.epoch++; await render();
  expect(container.querySelector("aside")).toBeNull(); await click("Files"); expect(container.querySelector("aside")).not.toBeNull();
});

it("matches Turkish tool and group labels using selected app language", async () => {
  const lower = String.prototype.toLocaleLowerCase;
  vi.spyOn(String.prototype, "toLocaleLowerCase").mockImplementation(function (this: string, locale) { return lower.call(this, locale ?? "en"); });
  fixture.locale = "tr"; await render("BİLGİSAYARLAR");
  expect(container.textContent).toContain("Bilgisayarlar");
  await render("iletişim"); expect(container.textContent).toContain("Asistan");
  expect(fixture.push).not.toHaveBeenCalled();
});

it("shows project and unsupported capability before opening tools", async () => {
  fixture.capabilities = [];
  await render();
  expect(container.textContent).toContain("Update needed");
  expect(container.textContent).toContain("Project required");
  await click("Browser");
  expect(container.querySelector("aside")).toBeNull();
  expect(fixture.push).toHaveBeenCalledWith({ pathname: "/tools/[tool]", params: { tool: "browser", projectId: "", machineId: "machine" } });
});
