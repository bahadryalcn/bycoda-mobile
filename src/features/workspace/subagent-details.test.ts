// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { Block } from "@/domain/types";
import { Sheet } from "@/ui/primitives";
import { SheetGuardContext, useSheetDismissal, useSheetGuards } from "@/ui/sheet-guard";
import type { TranscriptBlockProps } from "./session-types";
import { SubagentDetails } from "./subagent-details";
const state = vi.hoisted(() => ({
  allowed: true,
  epoch: true,
  capabilities: ["sessions.stopItem.claude"],
  commands: new Map<string, () => void>(),
  close: vi.fn(),
  cancel: undefined as undefined | (() => void),
  activeId: "m",
  confirmation: undefined as undefined | (() => void),
  command: vi.fn(async (_command: unknown) => undefined),
}));
vi.mock("@/state/machines", () => {
  const snapshot = () => ({
    activeId: state.activeId,
    machines: [{ id: "m", name: "Original computer", capabilities: state.capabilities }],
  });
  return {
    useMachines: Object.assign((selector: (s: any) => unknown) => selector(snapshot()), {
      getState: snapshot,
    }),
  };
});
vi.mock("@/state/connection-scope", () => {
  const scope = { isCurrent: () => state.epoch };
  return { useConnectionScope: () => scope };
});
vi.mock("@/ui/private-access", () => ({
  usePrivateContentAccess: () => ({ allowed: state.allowed, check: () => state.allowed }),
  PrivateContentAccessProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock("@/ui/search-field", () => ({
  CollectionToolbar: ({ field, actions }: any) => createElement("header", null, field, actions),
}));
vi.mock("@/ui/action-review-sheet", () => ({
  ActionReviewSheet: ({ children, onClose, onConfirm }: any) => {
    state.confirmation = onConfirm;
    state.cancel = onClose;
    return createElement("aside", null, children);
  },
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/tokens", () => ({ space: { xs: 4 } }));
vi.mock("../management/shared/format", () => ({ stamp: (value: unknown) => String(value) }));
vi.mock("@/ui/confirm", () => ({
  confirmAction: (_title: string, _text: string, _label: string, callback: () => void) => {
    state.confirmation = callback;
  },
}));
vi.mock("./shared", () => ({
  ErrorText: ({ error }: { error: unknown }) =>
    createElement("p", null, error ? String(error) : ""),
}));
vi.mock("./transcript-tool-preview", () => ({ TranscriptToolPreview: () => null }));
vi.mock("@/ui/message-text", () => ({
  MessageText: ({ text }: { text: string }) => createElement("p", null, text),
}));
vi.mock("@/ui/primitives", () => {
  const content = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const button = ({ label, onPress, disabled, busy }: any) => {
    state.commands.set(label, onPress);
    return createElement("button", { disabled: disabled || busy, onClick: onPress }, label);
  };
  return {
    Stack: content,
    Row: content,
    Body: content,
    Disclosure: ({ children, label, detail }: PropsWithChildren<{ label: string; detail?: string }>) =>
      createElement("details", null, createElement("summary", null, label, detail), children),
    Sheet: function SheetFixture({ children, title, onClose }: PropsWithChildren<{ title: string; onClose: () => void }>) {
      const guards = useSheetGuards();
      const { requestClose, requestCloseThen } = useSheetDismissal({ visible: true, dirty: guards.dirty, pending: guards.pending, onClose });
      return createElement(SheetGuardContext.Provider, { value: { register: guards.register, requestClose, requestCloseThen } },
        createElement("article", { "aria-label": title },
          createElement("header", null, title, button({ label: "Close", onPress: requestClose, disabled: guards.pending })), children));
    },
    NavigationRow: button,
    FormActions: ({ submitLabel, onSubmit, disabled, busy, feedback }: any) =>
      createElement(
        "footer",
        null,
        feedback,
        button({ label: submitLabel, onPress: onSubmit, disabled, busy }),
      ),
    Badge: ({ label }: { label: string }) => createElement("span", null, label),
    Notice: ({ message }: { message: string }) => createElement("p", null, message),
    StateView: ({ title }: { title: string }) => createElement("p", null, title),
    Button: ({
      label,
      onPress,
      disabled,
      busy,
    }: {
      label: string;
      onPress: () => void;
      disabled: boolean;
      busy: boolean;
    }) => createElement("button", { disabled: disabled || busy, onClick: onPress }, label),
  };
});
vi.mock("@/ui/screen-list", () => ({
  ScreenList: ({ header, footer, data, renderItem }: any) =>
    createElement(
      "main",
      null,
      header,
      ...data.map((item: any, index: number) =>
        createElement("section", { key: index }, renderItem({ item })),
      ),
      footer,
    ),
}));
const block = {
  id: "b",
  role: "tool",
  text: "Review",
  tool: { callId: "call", status: "running" },
  agentRun: { name: "Reviewer", steps: [] },
} as Block;
let root: ReturnType<typeof createRoot>;
const container = document.createElement("div");
async function mount(parentProvider: "claude" | "codex" = "claude") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(SubagentDetails, {
        block,
        scope: { machineId: "m", sessionId: "parent" },
        runId: "run",
        parentProvider,
        disabled: false,
        onCommand: state.command as unknown as TranscriptBlockProps["onCommand"],
      }),
    ),
  );
}
async function render(overrides: Partial<React.ComponentProps<typeof SubagentDetails>> = {}, sheet = false) {
  await act(async () =>
    {
      const detail = createElement(SubagentDetails, {
        block,
        scope: { machineId: "m", sessionId: "parent" },
        runId: "run",
        parentProvider: "claude",
        disabled: false,
        onCommand: state.command as unknown as TranscriptBlockProps["onCommand"],
        ...overrides,
      });
      root.render(sheet ? createElement(Sheet, { title: "Reviewer", visible: true, onClose: state.close }, detail) : detail);
    },
  );
}
async function press(label: string) {
  await act(async () => state.commands.get(label)!());
}
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  state.allowed = true;
  state.epoch = true;
  state.capabilities = ["sessions.stopItem.claude"];
  state.commands.clear();
  state.cancel = undefined;
  state.activeId = "m";
  state.confirmation = undefined;
});
it("opening details is read only; explicit confirmation targets the exact child call", async () => {
  await mount();
  expect(state.command).not.toHaveBeenCalled();
  await act(async () => container.querySelector("button")!.click());
  expect(state.command).not.toHaveBeenCalled();
  await act(async () => state.confirmation!());
  expect(state.command).toHaveBeenCalledExactlyOnceWith({
    type: "stopItem",
    sessionId: "parent",
    runId: "run",
    blockId: "b",
    callId: "call",
  });
  expect(container.textContent).toContain("stop request was accepted");
});
it("never replays an uncertain write", async () => {
  state.command.mockRejectedValueOnce(new Error("Network result unknown"));
  await mount();
  await act(async () => container.querySelector("button")!.click());
  const confirm = state.confirmation!;
  await act(async () => confirm());
  expect(state.command).toHaveBeenCalledTimes(1);
  expect(container.querySelector("button")).toBeNull();
  await act(async () => confirm());
  expect(state.command).toHaveBeenCalledTimes(1);
});
it("does not offer per-item stop for a provider without the real hook", async () => {
  await mount("codex");
  expect(container.querySelector("button")).toBeNull();
  expect(state.command).not.toHaveBeenCalled();
});

it("does not offer direct stop for a synthetic Workflow child", async () => {
  await mount();
  state.commands.clear();
  await render({ block: { ...block, agentRun: { ...block.agentRun!, workflow: { callId: "workflow-call", phase: "review" } } } });
  expect(container.querySelector("button")).toBeNull();
  expect(state.command).not.toHaveBeenCalled();
});

it("reviews full original computer/name/parent identity and cancels without a write", async () => {
  await mount();
  await press("Stop this subagent");
  const confirm = state.confirmation!;
  expect(container.querySelector("aside")!.textContent).toContain("Original computer");
  expect(container.querySelector("aside")!.textContent).toContain("Reviewer");
  expect(container.querySelector("aside")!.textContent).toContain("parent");
  await act(async () => state.cancel!());
  await act(async () => confirm());
  expect(state.command).not.toHaveBeenCalled();
  expect(container.querySelector("aside")).toBeNull();
});

it.each([
  "access",
  "epoch",
  "active",
  "capability",
  "provider",
  "run",
  "block",
  "call",
  "completed",
  "disabled",
  "name",
])("retires a stop review on %s change even after return", async (kind) => {
  await mount();
  await press("Stop this subagent");
  const confirm = state.confirmation!;
  if (kind === "access") state.allowed = false;
  if (kind === "epoch") state.epoch = false;
  if (kind === "active") state.activeId = "other";
  if (kind === "capability") state.capabilities = [];
  await render(
    kind === "provider"
      ? { parentProvider: "codex" }
      : kind === "run"
        ? { runId: "next" }
        : kind === "block"
          ? { block: { ...block, id: "other" } }
          : kind === "call"
            ? { block: { ...block, tool: { ...block.tool!, callId: "other" } } }
            : kind === "completed"
              ? { block: { ...block, tool: { ...block.tool!, status: "completed" } } }
              : kind === "disabled"
                ? { disabled: true }
                : kind === "name"
                  ? {
                      block: { ...block, agentRun: { ...block.agentRun!, name: "Different name" } },
                    }
                  : {},
  );
  state.allowed = true;
  state.epoch = true;
  state.activeId = "m";
  state.capabilities = ["sessions.stopItem.claude"];
  await render();
  await act(async () => confirm());
  expect(state.command).not.toHaveBeenCalled();
  expect(container.querySelector("aside")).toBeNull();
});

it("checks live capability loss before React commits and retires that confirmation", async () => {
  await mount();
  await press("Stop this subagent");
  const confirm = state.confirmation!;
  state.capabilities = [];
  await act(async () => confirm());
  state.capabilities = ["sessions.stopItem.claude"];
  await render();
  await act(async () => confirm());
  expect(state.command).not.toHaveBeenCalled();
  expect(container.querySelector("aside")).toBeNull();
});

it("keeps full assignment out of the activity header and reveals it explicitly", async () => {
  await mount();
  const value = {
    ...block,
    agentRun: {
      ...block.agentRun!,
      prompt: "Complete assignment ".repeat(200),
      steps: [{ id: "first", kind: "message" as const, text: "First visible activity" }],
    },
  };
  await render({ block: value });
  expect(container.textContent).not.toContain("Complete assignment");
  expect(container.textContent).toContain("First visible activity");
  await press("Assignment");
  expect(container.querySelector("article")!.textContent).toContain(value.agentRun.prompt);
  expect(state.command).not.toHaveBeenCalled();
});

it("shows the final report once in a full reader and retains other activity", async () => {
  await mount();
  await render({
    block: {
      ...block,
      tool: { ...block.tool!, status: "completed", detail: "Full final report" },
      agentRun: {
        ...block.agentRun!,
        steps: [
          { id: "other", kind: "message", text: "Retained activity" },
          { id: "child:report", kind: "message", text: "Full final report" },
        ],
      },
    },
  });
  expect(container.textContent).toContain("Retained activity");
  expect(container.textContent).not.toContain("Full final report");
  await press("Report");
  expect(container.textContent!.split("Full final report")).toHaveLength(2);
});

it("conceals cached assignment/activity and retires the reader after access loss", async () => {
  await mount();
  const value = {
    ...block,
    agentRun: {
      ...block.agentRun!,
      prompt: "Private assignment",
      steps: [{ id: "private", kind: "message" as const, text: "Private activity" }],
    },
  };
  await render({ block: value });
  await press("Assignment");
  state.allowed = false;
  await render({ block: value });
  expect(container.textContent).not.toContain("Private assignment");
  expect(container.textContent).not.toContain("Private activity");
  state.allowed = true;
  await render({ block: value });
  expect(container.querySelector("article")).toBeNull();
  expect(container.textContent).toContain("Private activity");
});

it("exposes provider-native nested steps and keeps distinct action output", async () => {
  await mount();
  await render({ block: {
    ...block,
    tool: { ...block.tool, status: "completed" },
    agentRun: { ...block.agentRun!, steps: [{
      id: "child", kind: "tool", status: "completed", text: "Called reviewer", output: "Distinct action output",
      agentRun: { name: "Nested reviewer", steps: [{ id: "grandchild", kind: "message", text: "Nested finding" }] },
    }] },
  } });
  const nested = [...container.querySelectorAll("details")].find(node => node.querySelector("summary")?.textContent?.includes("Nested reviewer"));
  expect(nested?.textContent).toContain("Nested finding");
  expect(nested?.textContent).toContain("Distinct action output");
});

it("uses one header close on details and each nested reader", async () => {
  await mount();
  const completed = {
    ...block,
    tool: { ...block.tool, status: "completed", detail: "Final report" },
    agentRun: { ...block.agentRun!, prompt: "Read the checklist" },
  };
  await render({ block: completed }, true);
  const closeButtons = (section: ParentNode) => [...section.querySelectorAll("button")].filter(button => button.textContent === "Close");
  const detail = container.querySelector('article[aria-label="Reviewer"]')!;
  expect(closeButtons(detail)).toHaveLength(1);
  for (const reader of ["Assignment", "Report"]) {
    await press(reader);
    const nested = detail.querySelector(`article[aria-label="${reader}"]`)!;
    expect(closeButtons(nested)).toHaveLength(1);
    await act(async () => closeButtons(nested)[0].click());
    expect(detail.querySelector("article")).toBeNull();
  }
  await act(async () => closeButtons(detail)[0].click());
  expect(state.close).toHaveBeenCalledOnce();
});

it("keeps one pending stop, rejects queued close and permits close after acknowledgement", async () => {
  await mount();
  await render({ disabled: true }, true);
  const close = state.commands.get("Close")!;
  await render({}, true);
  let resolve!: () => void;
  state.command.mockImplementationOnce(
    () =>
      new Promise<undefined>((done) => {
        resolve = () => done(undefined);
      }),
  );
  await press("Stop this subagent");
  const confirm = state.confirmation!;
  await act(async () => confirm());
  await act(async () => {
    confirm();
    close();
  });
  expect(state.command).toHaveBeenCalledTimes(1);
  expect(state.close).not.toHaveBeenCalled();
  await act(async () => resolve());
  await press("Close");
  expect(state.close).toHaveBeenCalledOnce();
});

it("does not act on retained callbacks after unmount", async () => {
  await mount();
  await press("Stop this subagent");
  const confirm = state.confirmation!;
  await act(async () => root.unmount());
  await act(async () => confirm());
  expect(state.command).not.toHaveBeenCalled();
});
