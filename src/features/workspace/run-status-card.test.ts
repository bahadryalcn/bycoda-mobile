// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { Block } from "@/domain/types";
import { RunStatusCard } from "./run-status-card";

vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("panelui-native/components/spinner", () => ({ Spinner: () => null }));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: Record<string, unknown>) => en.replace(/\{(p\d+)\}/g, (_, key) => String(values?.[key])) }));
vi.mock("@/ui/typography", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("@/ui/feedback", () => ({ Badge: ({ label }: { label: string }) => createElement("span", null, label) }));
vi.mock("./use-elapsed-now", () => ({ useElapsedNow: () => 66_000 }));
vi.mock("@/ui/primitives", () => ({
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label),
  PressableCard: ({ label, onPress, children, style }: PropsWithChildren<{ label: string; onPress: () => void; style: { minHeight: number } }>) => createElement("button", { "aria-label": label, onClick: onPress, "data-min-height": style.minHeight }, children),
  Sheet: ({ visible, title, children }: PropsWithChildren<{ visible: boolean; title: string }>) => visible ? createElement("article", { "aria-label": title }, children) : null,
}));

const user = { id: "u", role: "user", text: "go", startedAt: 1000 } as Block;
const container = document.createElement("div");
let root: ReturnType<typeof createRoot> | undefined;
async function render(blocks: readonly Block[], live = true, onOpenAgents = vi.fn()) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root ??= createRoot(container);
  await act(async () => root!.render(createElement(RunStatusCard, { blocks, live, onOpenAgents })));
  return onOpenAgents;
}
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

it("keeps text-only Working and a Host-recorded elapsed time above the input", async () => {
  await render([user]);
  expect(container.textContent).toBe("Working 1:05");
  expect(container.querySelector("button")!.getAttribute("data-min-height")).toBe("48");
  expect(container.querySelector("article")).toBeNull();
});

it("does not reopen an old details sheet when a stopped or replaced turn starts", async () => {
  await render([user]);
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector("article")).not.toBeNull();
  await render([user], false);
  await render([user]);
  expect(container.querySelector("article")).toBeNull();
  await act(async () => container.querySelector("button")!.click());
  await render([{ ...user, id: "next-turn" }]);
  expect(container.querySelector("article")).toBeNull();
});

it.each([undefined, NaN, Infinity, -1, 100_000])("omits unknown or invalid elapsed time (%s)", async (startedAt) => {
  await render([{ ...user, startedAt }]);
  expect(container.textContent).toBe("Working");
});

it("opens bounded tool details and keeps approval status discoverable", async () => {
  const tools = Array.from({ length: 7 }, (_, index) => ({
    id: `t${index}`, role: "tool", text: `Long tool ${index} ${"工具".repeat(100)}`,
    tool: { callId: String(index), status: "running", kind: "execute" },
    ...(index === 0 ? { approval: { requestId: 1 } } : {}),
  }) as Block);
  await render([user, ...tools]);
  expect(container.querySelector("button")!.getAttribute("aria-label")).toContain("1 awaiting approval");
  await act(async () => container.querySelector("button")!.click());
  const details = container.querySelector("article")!;
  expect(details.textContent).toContain("Long tool 0");
  expect(details.textContent).toContain("Long tool 4");
  expect(details.textContent).not.toContain("Long tool 5");
  expect(details.textContent).toContain("+2 more");
});

it("closes run details before opening existing agent details and hides after stop", async () => {
  const agent = { id: "a", role: "tool", text: "agent", tool: { status: "running" }, agentRun: { name: "agent" } } as Block;
  const open = await render([user, agent]);
  await act(async () => container.querySelector("button")!.click());
  await act(async () => container.querySelector<HTMLButtonElement>("article button")!.click());
  expect(open).toHaveBeenCalledOnce();
  expect(container.querySelector("article")).toBeNull();
  await render([user, agent], false);
  expect(container.textContent).toBe("");
});

it.each([NaN, Infinity, -1, 100_000])("omits invalid tool-local duration (%s)", async (startedAt) => {
  await render([user, { id: "tool", role: "tool", text: "Tool detail", startedAt, tool: { status: "running" } } as Block]);
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector("article")!.textContent).toBe("1 tools runningTool detail");
});
