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
  return { Body: Group, Section: Group, Row: Group, ErrorNotice: () => createElement("p", null, "error"), Separator: () => null,
    SectionHeader: ({ title, trailing }: { title: string; trailing?: unknown }) => createElement("div", null, title, trailing as never),
    // The row and header menus show each action as a button, as a one-action menu renders it directly.
    ActionMenu: ({ actions }: { actions: { key: string; label: string; onPress(): void; disabled?: boolean }[] }) =>
      createElement("div", null, actions.map(action => createElement("button", { key: action.key, onClick: action.onPress, disabled: action.disabled }, action.label))),
    Badge: ({ label }: { label: string }) => createElement("span", null, label),
    StatusText: ({ label }: { label: string }) => createElement("span", null, label),
    Button: ({ label, onPress, disabled }: { label: string; onPress(): void; disabled?: boolean }) => createElement("button", { onClick: onPress, disabled }, label),
    Sheet: ({ title, children }: PropsWithChildren<{ title: string }>) => createElement("section", { "aria-label": title }, children),
    FormActions: ({ submitLabel, onSubmit }: { submitLabel: string; onSubmit(): void }) => createElement("button", { onClick: onSubmit }, submitLabel) };
});
import { AssistantJobsSection } from "./assistant-jobs-section";
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
const controlJob = vi.fn(), changed = vi.fn(async () => {}), pauseAll = vi.fn(async () => {}), resumeAll = vi.fn(async () => {});
const jobs = Array.from({ length: 25 }, (_, index) => ({ id: `job-${index}`, title: `Work ${index}`, version: index + 1, status: "running", progress: { done: 0, total: 0 } })) as AssistantJob[];
const render = (items: AssistantJob[], paused = false) => act(async () => root.render(createElement(AssistantJobsSection, { client: { controlJob, pauseAll, resumeAll } as unknown as AssistantMobileClient, jobs: items, paused, holds: undefined, current: () => true, enabled: true, onChanged: changed })));
const buttonNamed = (label: string) => [...container.querySelectorAll("button")].find(node => node.textContent === label);
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

const job = (id: string, status: AssistantJob["status"]) => ({ id, title: `Job ${id}`, version: 1, status, progress: { done: 0, total: 0 } }) as AssistantJob;
// The settings sheet's "Pause the assistant's work" actually cancelled every job; stopping all now sits
// with the jobs it ends, names them first and counts only jobs that can still stop.
it("offers stopping all unfinished jobs after a review that names them", async () => {
  await render([job("a", "running"), job("b", "queued"), job("c", "failed")]);
  await act(async () => buttonNamed("Stop all jobs (2)")!.click());
  const review = container.querySelector('section[aria-label="Stop all jobs?"]')!;
  expect(review.textContent).toContain("Job a");
  expect(review.textContent).toContain("Job b");
  expect(review.textContent).not.toContain("Job c");
  expect(pauseAll).not.toHaveBeenCalled();
  await act(async () => buttonNamed("Stop all")!.click());
  expect(pauseAll).toHaveBeenCalledTimes(1);
  expect(changed).toHaveBeenCalled();
  expect(container.querySelector('section[aria-label="Stop all jobs?"]')).toBeNull();
});
it("hides stop all without unfinished jobs and retires an open review when the list changes", async () => {
  await render([job("c", "failed")]);
  expect(container.textContent).not.toContain("Stop all jobs");
  await render([job("a", "running")]);
  await act(async () => buttonNamed("Stop all jobs (1)")!.click());
  expect(container.querySelector('section[aria-label="Stop all jobs?"]')).not.toBeNull();
  await render([job("a", "running"), job("b", "running")]);
  expect(container.querySelector('section[aria-label="Stop all jobs?"]')).toBeNull();
  expect(pauseAll).not.toHaveBeenCalled();
});
it("shows a paused assistant with Resume even when no job is listed", async () => {
  await render([], true);
  expect(container.textContent).toContain("Assistant paused");
  await act(async () => buttonNamed("Resume")!.click());
  expect(resumeAll).toHaveBeenCalledTimes(1);
  expect(pauseAll).not.toHaveBeenCalled();
});
