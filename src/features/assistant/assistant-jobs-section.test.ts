// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AssistantJob } from "../../../../src/shared/model/host-contracts/assistant";
import type { AssistantMobileClient } from "./assistant-client";
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: Record<string, string | number>) => en.replace(/\{(p\d+)\}/g, (_, key) => String(values?.[key] ?? key)) }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Group, Section: Group, Row: Group, Sheet: Group, ErrorNotice: () => null,
    Badge: ({ label }: { label: string }) => createElement("span", null, label),
    Button: ({ label, onPress, disabled }: { label: string; onPress(): void; disabled?: boolean }) => createElement("button", { onClick: onPress, disabled }, label), FormActions: () => null };
});
import { AssistantJobsSection } from "./assistant-jobs-section";
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
const controlJob = vi.fn(), changed = vi.fn();
const jobs = Array.from({ length: 25 }, (_, index) => ({ id: `job-${index}`, title: `Work ${index}`, version: index + 1, status: "running", progress: { done: 0, total: 0 } })) as AssistantJob[];
const render = (items: AssistantJob[]) => act(async () => root.render(createElement(AssistantJobsSection, { client: { controlJob } as unknown as AssistantMobileClient, jobs: items, holds: undefined, current: () => true, enabled: true, onChanged: changed })));
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks(); container = document.createElement("div"); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
it("reveals jobs beyond the initial twenty and reports exactly how many are visible", async () => {
  await render(jobs); expect(container.textContent).toContain("Showing 20 of 25 jobs"); expect(container.textContent).not.toContain("Work 24");
  const more = [...container.querySelectorAll("button")].find(node => node.textContent === "Show more jobs"); expect(more).toBeDefined();
  await act(async () => more!.click()); expect(container.textContent).toContain("Work 24"); expect(container.textContent).toContain("Showing 25 of 25 jobs");
  expect([...container.querySelectorAll("button")].some(node => node.textContent === "Show more jobs")).toBe(false);
  expect(controlJob).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
});
it("does not add pagination or a fabricated count for an empty job list", async () => { await render([]); expect(container.textContent).toBe(""); });
