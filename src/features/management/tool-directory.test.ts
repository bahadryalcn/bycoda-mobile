// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("./pull-request-icon", () => ({ PullRequestIcon: () => null }));
vi.mock("@/ui/duotone-icon", () => Object.fromEntries(
  ["FolderOpen", "GitBranch", "MessagesSquare", "CheckSquare", "Target", "Users", "Clock", "NotebookPen", "Bot", "Megaphone", "Activity", "Layers", "Plug", "KeyRound", "Inbox", "Laptop", "ShieldCheck", "Server", "ScrollText", "Smartphone", "Globe", "Terminal", "ChartColumn"].map((name) => [name, () => null]),
));
const fixture = vi.hoisted(() => ({ activeId: "machine", epoch: 0, locale: "en", push: vi.fn(), selectProject: vi.fn(), clear: vi.fn(), capabilities: undefined as string[] | undefined }));
vi.mock("@/state/connection-scope", () => { const epochs = new Map<number, any>(); return { useConnectionScope: () => {
  const epoch = fixture.epoch; if (!epochs.has(epoch)) epochs.set(epoch, { token: String(epoch), isCurrent: () => fixture.epoch === epoch }); return epochs.get(epoch);
} }; });
vi.mock("expo-router", () => ({ router: { navigate: fixture.push } }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/tokens", () => ({ iconSize: { inline: 14, status: 16, row: 20, action: 20, back: 24 }, colors: {} }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (tr: string, en: string) => fixture.locale === "tr" ? tr : en }));
vi.mock("@/i18n", () => ({ useLocale: () => fixture.locale }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "machine", environmentId: "host", capabilities: fixture.capabilities }), useMachines: { getState: () => ({ activeId: fixture.activeId, selectProject: fixture.selectProject }) } }));
vi.mock("../workspace/project-picker", async () => {
  const { useState } = await import("react");
  return { ProjectPicker: ({ onSelect }: any) => {
    const [value, setValue] = useState("");
    return createElement("aside", null, createElement("input", { "aria-label": "Picker search", value, onChange: (event: any) => setValue(event.target.value) }),
      createElement("button", { onClick: () => onSelect({ id: "project", name: "Project" }) }, "Choose project"));
  } };
});
vi.mock("@/ui/primitives", () => ({
  RowIcon: () => null,
  NavigationGroup: ({ children }: PropsWithChildren) => createElement("div", null, children),
  Section: ({ children, title }: PropsWithChildren<{ title: string }>) => createElement("section", null, createElement("h2", null, title), children),
  NavigationRow: ({ label, detail, onPress }: any) => createElement("div", null, createElement("button", { onClick: onPress }, label), detail),
  Empty: ({ title, action }: any) => createElement("div", null, title, action ? createElement("button", { onClick: action.onPress }, action.label) : null),
}));
import { ToolDirectory } from "./tool-directory";
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
async function render(query = "", projectId: string | null = null, extra: Partial<Parameters<typeof ToolDirectory>[0]> = {}) {
  await act(async () => root.render(createElement(ToolDirectory, { query, projectId, onClearSearch: fixture.clear, ...extra })));
}
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click()); }
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); fixture.activeId = "machine"; fixture.epoch = 0; fixture.locale = "en"; container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
it("offers clear recovery without empty headings and preserves an already-open picker/search through filtering", async () => {
  await render(); await click("Terminals");
  const field = container.querySelector("input")!;
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(field, "keep picker search"); field.dispatchEvent(new Event("input", { bubbles: true })); });
  await render("no matching tool 123"); expect(container.querySelectorAll("h2")).toHaveLength(0);
  expect(container.querySelector<HTMLInputElement>("input")!.value).toBe("keep picker search");
  await click("Clear search"); expect(fixture.clear).toHaveBeenCalledOnce();
  await click("Choose project"); expect(fixture.push).toHaveBeenCalledWith({ pathname: "/tools/[tool]", params: { tool: "terminals", projectId: "project", machineId: "machine" } });
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
  await render(); await click("Terminals"); expect(container.querySelector("aside")).not.toBeNull(); fixture.epoch++; await render();
  expect(container.querySelector("aside")).toBeNull(); await click("Terminals"); expect(container.querySelector("aside")).not.toBeNull();
});

it("matches Turkish tool and group labels using selected app language", async () => {
  const lower = String.prototype.toLocaleLowerCase;
  vi.spyOn(String.prototype, "toLocaleLowerCase").mockImplementation(function (this: string, locale) { return lower.call(this, locale ?? "en"); });
  fixture.locale = "tr"; await render("BİLGİSAYAR ERİŞİMİ");
  expect(container.textContent).toContain("Bilgisayar erişimi");
  await render("işler"); expect(container.textContent).toContain("Görevler");
  expect(fixture.push).not.toHaveBeenCalled();
});

it("shows unsupported capability and leaves project scope to the opened tool", async () => {
  fixture.capabilities = [];
  await render();
  expect(container.textContent).toContain("Update needed");
  expect(container.textContent).not.toContain("Project required");
  await click("Browser");
  expect(container.querySelector("aside")).toBeNull();
  expect(fixture.push).toHaveBeenCalledWith({ pathname: "/tools/[tool]", params: { tool: "browser", projectId: "", machineId: "machine" } });
});

it("lists no Social tool and no tool the dock or Settings already owns", async () => {
  await render();
  for (const label of ["Social media", "Inbox", "Computers", "Sessions"]) expect(container.textContent).not.toContain(label);
  await render("", "project", { onProjectView: vi.fn() });
  expect(container.textContent).toContain("Sessions");
});

it("keeps every root row inside the tab: no Assistant or Jira, Files and Changes only in a project's sheet", async () => {
  await render();
  for (const label of ["Assistant", "Jira", "Files", "Changes"])
    expect([...container.querySelectorAll("button")].some((button) => button.textContent === label)).toBe(false);
  expect([...container.querySelectorAll("h2")].map((heading) => heading.textContent)).toEqual(["Work", "Project", "Computer"]);
  await render("", "project", { onProjectView: vi.fn() });
  for (const label of ["Files", "Changes"]) expect(container.textContent).toContain(label);
});

it.each([null, "project"])("opens pull requests from the Tools tab with project scope %s", async (projectId) => {
  await render("", projectId); await click("Pull requests");
  expect(container.querySelector("aside")).toBeNull();
  expect(fixture.push).toHaveBeenCalledWith({ pathname: "/pull-requests", params: { machineId: "machine", ...(projectId ? { projectId } : {}) } });
});

it("opens computer usage without a project and says which tools will ask for one", async () => {
  fixture.capabilities = undefined;
  await render();
  const detail = (label: string) => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.parentElement!.textContent;
  expect(detail("Terminals")).toContain("Choose a project");
  expect(detail("Usage and limits")).not.toContain("Choose a project");
  await click("Usage and limits");
  expect(container.querySelector("aside")).toBeNull();
  expect(fixture.push).toHaveBeenCalledWith({ pathname: "/tools/[tool]", params: { tool: "usage", projectId: "", machineId: "machine" } });
  await render("", "project");
  expect(detail("Terminals")).not.toContain("Choose a project");
});

it("treats usage as supported when the computer serves limits but not session usage", async () => {
  fixture.capabilities = ["usage.limits.read"];
  await render();
  const detail = [...container.querySelectorAll("button")].find((button) => button.textContent === "Usage and limits")!.parentElement!.textContent;
  expect(detail).not.toContain("Update needed");
  fixture.capabilities = undefined;
});

it.each([null, "project"])("opens management with the explicit Tools project filter %s", async (projectId) => {
  await render("", projectId);
  await click("Tasks");
  expect(fixture.push).toHaveBeenCalledWith({ pathname: "/manage/[section]", params: {
    section: "tasks", machineId: "machine", environmentId: "host", projectFilter: projectId ? "project" : "all",
    ...(projectId ? { projectId } : {}),
  } });
});
