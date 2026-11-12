// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  current: true,
  visible: true,
  unknown: false,
  headerTitle: "",
  threadVersion: 1,
  setPresence: vi.fn(),
  inspect: vi.fn(),
  reads: vi.fn(),
  snapshot: {
    profile: { name: "Saved assistant" },
    presence: { state: "present" },
    threads: [{ id: "global-thread", summary: "Unproven hidden summary" }],
  } as any,
  messages: [
    {
      id: "global",
      threadId: "global-thread",
      text: "Visible global text",
      role: "user",
      via: "voice",
      createdAt: 1,
      projectIds: [],
    },
    {
      id: "mixed",
      threadId: "global-thread",
      text: "Never reveal hidden participant",
      role: "assistant",
      via: "text",
      createdAt: 2,
      projectIds: ["visible", "hidden"],
    },
    {
      id: "unknown",
      threadId: "global-thread",
      text: "Never reveal unknown context",
      role: "assistant",
      via: "voice",
      createdAt: 3,
    },
  ] as any[],
}));
const connection = {
  token: "captured-connection",
  review: { environmentId: "exact-environment" },
  isCurrent: () => fixture.current,
};
const transport = { request: vi.fn() };
vi.mock("react-native", () => ({ View: ({ children }: { children?: unknown }) => children }));
vi.mock("../workspace/session-keyboard-frame", () => ({
  SessionKeyboardFrame: ({ children, composer }: any) =>
    createElement("div", null, children, composer),
}));
vi.mock("../approvals/use-approvals", () => ({ usePendingApprovalCount: () => 0 }));
vi.mock("./assistant-composer", () => ({ AssistantComposer: () => null }));
vi.mock("./assistant-jobs-section", () => ({ AssistantJobsSection: () => null }));
vi.mock("./assistant-questions-section", () => ({ AssistantQuestionsSection: () => null }));
vi.mock("./assistant-message-row", () => ({
  AssistantMessageRow: ({ message }: any) => createElement("p", null, message.text),
}));
vi.mock("expo-router", () => ({
  router: { push: vi.fn() },
  Stack: { Screen: ({ options }: { options: { title: string } }) => { fixture.headerTitle = options.title; return null; } },
}));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({ id: "machine", name: "Paired computer" }),
}));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: () => connection }));
vi.mock("@/state/queries", () => ({
  useHostClient: () => transport,
  useHostReadActive: () => true,
  hostKey: (id: string, key: unknown[]) => ["machine", id, ...key],
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/error-message", () => ({ remoteErrorKind: (error: any) => error?.kind }));
vi.mock("../workspace/use-project-directory", () => ({
  useProjectList: () => ({
    directoryReady: true,
    data: [{ id: "visible", name: "Visible project" }],
    isProjectVisible: (id: string) => fixture.visible && id === "visible",
  }),
}));
vi.mock("./assistant-client", () => ({
  AssistantMobileClient: class {
    pendingPresence?: { status: string };
    async read(input: any) {
      fixture.reads(input);
      if (input.op === "snapshot") return { snapshot: fixture.snapshot };
      if (input.op === "threads.open") return { thread: { id: "global-thread", summary: "" } };
      return {
        thread: {
          id: "global-thread",
          version: fixture.threadVersion,
          summary: "Unproven hidden summary",
        },
        messages: input.beforeId ? [] : fixture.messages,
      };
    }
    async setPresence(value: string) {
      await fixture.setPresence(value);
      if (fixture.unknown) {
        this.pendingPresence = { status: "unknown" };
        throw new Error("lost reply");
      }
      fixture.snapshot = { ...fixture.snapshot, presence: { state: value } };
    }
    async inspectPresence() {
      fixture.inspect();
      this.pendingPresence = undefined;
      return fixture.snapshot;
    }
  },
}));
vi.mock("@/ui/primitives", () => ({
  Screen: ({ children }: PropsWithChildren) => createElement("main", null, children),
  ScreenList: ({ header, data, renderItem, ListFooterComponent, title }: any) =>
    createElement(
      "main",
      null,
      createElement("h1", null, title),
      header,
      ...data.map((item: any) => createElement("div", { key: item.id }, renderItem({ item }))),
      ListFooterComponent,
    ),
  Body: ({ children }: PropsWithChildren) => createElement("p", null, children),
  Section: ({ title, children }: PropsWithChildren<{ title: string }>) =>
    createElement("section", null, createElement("h2", null, title), children),
  Row: ({ children }: PropsWithChildren) => createElement("div", null, children),
  Button: ({ label, onPress, disabled, busy, selected }: any) =>
    createElement(
      "button",
      { onClick: onPress, disabled: disabled || busy, "aria-pressed": selected, "aria-busy": busy },
      label,
    ),
  SelectField: ({ label, value, options, onChange, disabled }: any) =>
    createElement(
      "select",
      {
        "aria-label": label,
        value: value ?? "",
        disabled,
        onChange: (event: any) => onChange(event.target.value),
      },
      ...options.map((option: any) =>
        createElement("option", { key: option.value, value: option.value }, option.label),
      ),
    ),
  QueryState: () => null,
  Notice: ({ message }: any) => createElement("p", { role: "status" }, message),
  Empty: ({ title }: any) => createElement("p", null, title),
}));
import { AssistantScreen } from "./assistant-screen";
let root: ReturnType<typeof createRoot>, container: HTMLDivElement, cache: QueryClient;
async function render() {
  await act(async () =>
    root.render(
      createElement(QueryClientProvider, { client: cache }, createElement(AssistantScreen)),
    ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
async function click(label: string) {
  await act(async () => {
    const button = [...container.querySelectorAll("button")].find(
      (row) => row.textContent === label,
    )!;
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.current = true;
  fixture.visible = true;
  fixture.unknown = false;
  fixture.threadVersion = 1;
  fixture.snapshot = {
    profile: { name: "Saved assistant" },
    presence: { state: "present" },
    threads: [{ id: "global-thread", summary: "Unproven hidden summary" }],
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("renders canonical history behind paired scope and hides unknown/mixed-private messages and unproven summary", async () => {
  await render();
  expect(container.textContent).toContain("Paired computer");
  await click("Open conversation");
  await render();
  expect(container.textContent).toContain("Visible global text");
  expect(container.textContent).not.toContain("Never reveal");
  expect(container.textContent).not.toContain("Unproven hidden summary");
  expect(container.textContent).toContain(
    "Messages whose access could not be verified are hidden.",
  );
  fixture.current = false;
  await render();
  expect(container.textContent).not.toContain("Visible global text");
});
it("keeps an uncertain presence attempt visible with writes disabled and checks status without replay", async () => {
  await render();
  fixture.unknown = true;
  await click("Away");
  expect(fixture.setPresence).toHaveBeenCalledExactlyOnceWith("away");
  expect(container.textContent).toContain("will not be resent automatically");
  expect(container.textContent).not.toContain("The operation could not be completed.");
  const here = [...container.querySelectorAll("button")].find((row) => row.textContent === "Here")!;
  expect(here.disabled).toBe(true);
  await click("Read current status");
  expect(fixture.inspect).toHaveBeenCalledOnce();
  expect(fixture.setPresence).toHaveBeenCalledTimes(1);
  expect(container.textContent).not.toContain("will not be resent automatically");
});

it("shows pending feedback on the actual initiating presence control", async () => {
  await render();
  let release!: () => void;
  fixture.setPresence.mockImplementationOnce(
    () => new Promise<void>((resolve) => (release = resolve)),
  );
  await click("Away");
  const buttons = [...container.querySelectorAll("button")];
  expect(buttons.find((row) => row.textContent === "Away")!.getAttribute("aria-busy")).toBe("true");
  expect(
    buttons.find((row) => row.textContent === "Open conversation")!.getAttribute("aria-busy"),
  ).not.toBe("true");
  await act(async () => release());
  await render();
});
it("uses the actual oldest canonical message ID when loading a page of tied timestamps", async () => {
  const original = fixture.messages;
  fixture.messages = Array.from({ length: 100 }, (_, index) => ({
    id: index === 0 ? "z-canonical-oldest" : `a-canonical-${index}`,
    threadId: "global-thread",
    text: `Loaded tied message ${index}`,
    role: "user",
    via: "text",
    createdAt: 1,
    projectIds: [],
  }));
  try {
    await render();
    await click("Open conversation");
    await render();
    await click("Load earlier messages");
    expect(fixture.reads).toHaveBeenCalledWith({
      op: "threads.messages",
      threadId: "global-thread",
      limit: 100,
      before: 1,
      beforeId: "z-canonical-oldest",
    });
    expect(container.textContent).toContain("Loaded tied message 0");
    expect(container.textContent).toContain("Loaded tied message 99");
  } finally {
    fixture.messages = original;
  }
});


it("keeps the native title aligned with the current profile and clears it on source expiry", async () => {
  await render();
  expect(fixture.headerTitle).toBe("Saved assistant");
  fixture.current = false;
  await render();
  expect(fixture.headerTitle).toBe("Assistant");
});
