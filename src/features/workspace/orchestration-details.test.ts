// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { Block } from "@/domain/types";
import { OrchestrationDetails } from "./orchestration-details";
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: Record<string, string | number>) => en.replace(/\{p0\}/g, String(values?.p0 ?? "")) }));
vi.mock("@/ui/message-text", () => ({ MessageText: ({ text }: { text: string }) => createElement("p", null, text) }));
vi.mock("@/ui/primitives", () => {
  const content = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: content, Stack: content, Row: content,
    Badge: ({ label }: { label: string }) => createElement("span", null, label),
    Notice: ({ message }: { message: string }) => createElement("p", null, message) };
});
vi.mock("@/ui/screen-list", () => ({ ScreenList: ({ data, renderItem, header, footer }: { data: unknown[]; renderItem: (row: { item: unknown }) => ReactNode; header: ReactNode; footer: ReactNode }) =>
  createElement("div", null, header, ...data.map((item) => renderItem({ item })), footer) }));
it("reads actual proposal ownership, checkout, worker settings and dependencies without execution controls", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const block = { id: "proposal", role: "plan", text: "", orchestration: {
    version: 1, leadId: "lead", cwd: "/project", checkoutCwd: "/worktree", title: "Implementation", summary: "Summary",
    request: "Original request", author: { harness: "claude", model: "model", name: "Model" }, status: "ready",
    settings: { maxWorkers: 2, choices: [{ harness: "claude", model: "worker", name: "Worker" }] },
    tasks: [{ id: "a", title: "Inspect", harness: "claude", model: "worker", prompt: "Inspect source", files: ["src/a.ts"], dependsOn: [] },
      { id: "b", title: "Implement", harness: "claude", model: "worker", prompt: "Apply change", files: ["src/b.ts"], dependsOn: ["a"], modelSettings: { effort: "high" } }],
  } } as Block;
  try {
    await act(async () => root.render(createElement(OrchestrationDetails, { block, scope: { machineId: "m", sessionId: "lead" } })));
    for (const text of ["lead", "/project", "/worktree", "Original request", "Concurrent worker limit: 2", "Inspect (a)", "effort: high"])
      expect(container.textContent).toContain(text);
    expect(container.querySelectorAll("button,input,textarea")).toHaveLength(0);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
