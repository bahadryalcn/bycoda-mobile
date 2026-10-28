// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ThreadEditor } from "./thread-editor";
import type { SocialThread } from "@/domain/types";
import type { ThreadEditorProps } from "./types";

const fixture = vi.hoisted(() => ({
  query: vi.fn(),
  refetch: vi.fn(),
  current: undefined as unknown,
  edit: undefined as undefined | ((value: string) => void),
  chooseProject: undefined as undefined | ((value: string) => void),
  submit: undefined as undefined | (() => Promise<unknown>),
  assign: vi.fn(),
  save: vi.fn(),
  guard: vi.fn(),
  pending: false,
  fetching: false,
  heldOffset: undefined as number | undefined,
  disabled: false,
  machine: { id: "machine", endpoint: "https://one.example", environmentId: "environment", lanKey: "private-key" },
  serial: 0,
  fresh: vi.fn(),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => `detail-${++fixture.serial}` }));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => fixture.machine,
  useMachines: { getState: () => ({ activeId: fixture.machine.id, machines: [fixture.machine] }) },
}));
vi.mock("@/ui/motion", () => ({ haptic: { success: vi.fn() } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: (guard: unknown) => {
  fixture.guard(guard);
  return { requestClose: vi.fn() };
} }));
vi.mock("@/state/queries", () => ({
  useHostQuery: (...args: unknown[]) => {
    fixture.query(...args);
    const offset = (args[2] as { input: { offset?: number } }).input.offset;
    const held = fixture.heldOffset !== undefined && fixture.heldOffset === offset;
    return { data: held ? undefined : fixture.current, refetch: fixture.refetch, isFetching: held || fixture.fetching };
  },
  useHostMutation: () => ({ mutate: fixture.assign, mutateAsync: fixture.save, isPending: fixture.pending }),
}));
vi.mock("@/state/actions", () => ({ useAsyncAction: () => ({
  isPending: false,
  run: (action: () => Promise<unknown>) => action(),
}) }));
vi.mock("./policy", () => ({
  usePolicy: () => ({ data: { effective: {} } }),
  freshPolicy: async () => { await fixture.fresh(); return { effective: {} }; },
  PolicyInfo: () => null,
  PolicyCounter: () => null,
}));
vi.mock("./fact-choices", () => ({ FactChoices: () => null }));
vi.mock("../shared/format", () => ({ identifier: () => "request", stamp: () => "now" }));
vi.mock("@/ui/message-text", () => ({
  MessageText: ({ text }: { text: string }) => createElement("p", null, text),
}));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Stack: wrapper,
    Body: wrapper,
    Card: wrapper,
    Heading: wrapper,
    Notice: ({ message }: { message: string }) => createElement("aside", null, message),
    QueryState: () => null,
    MutationState: () => null,
    SelectField: ({ onChange }: { onChange: (value: string) => void }) => {
      fixture.chooseProject = onChange;
      return null;
    },
    FormActions: ({ onSubmit, disabled }: { onSubmit: () => Promise<unknown>; disabled: boolean }) => {
      fixture.submit = onSubmit;
      fixture.disabled = disabled;
      return null;
    },
    Field: ({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) => {
      fixture.edit = onChangeText;
      return createElement("output", null, value);
    },
    Button: ({ label, onPress, busy, disabled }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean }) =>
      createElement("button", { onClick: onPress, disabled: disabled || busy, "aria-busy": busy || undefined }, label),
  };
});
const container = document.createElement("div");
const fullPage = (thread: SocialThread, offset = 0, total = thread.events.length): SocialThread => ({
  ...thread, eventsPreview: false, eventsPage: { offset, limit: 20, total },
});
let root: ReturnType<typeof createRoot>;
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  fixture.save.mockReset();
  fixture.current = undefined;
  fixture.pending = false;
  fixture.fetching = false;
  fixture.heldOffset = undefined;
  fixture.refetch.mockReset();
  fixture.edit = undefined;
  fixture.chooseProject = undefined;
  fixture.submit = undefined;
  fixture.machine = { id: "machine", endpoint: "https://one.example", environmentId: "environment", lanKey: "private-key" };
  fixture.fresh.mockReset();
});

it("refreshes detail events/review feedback without resetting the open reply draft", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const thread = {
    id: "thread",
    accountId: "account",
    projectId: "project",
    kind: "message",
    events: [{ id: "old", platformId: "remote-old", direction: "inbound", text: "Old message", at: 1 }],
  } as SocialThread;
  fixture.current = fullPage(thread);
  root = createRoot(container);
  const render = () =>
    root.render(
      createElement(ThreadEditor, {
        thread,
        accounts: [],
        projects: [],
        profiles: [],
        onClose: vi.fn(),
      }),
    );
  await act(async () => render());
  expect(fixture.query).toHaveBeenCalledWith(
    ["social", "thread", "thread", "page", expect.any(String), "latest"],
    "social.request",
    { action: "thread.page", input: { id: "thread", limit: 20 } },
    { enabled: true, interval: 8000, queryFn: expect.any(Function) },
  );
  act(() => fixture.edit!("Unsent reply"));
  fixture.current = fullPage({
    ...thread,
    reviewReason: "New review reason",
    events: [...thread.events, { id: "new", platformId: "remote-new", direction: "inbound", text: "New message", at: 2 }],
  });
  await act(async () => render());
  expect(container.textContent).toContain("New message");
  expect(container.textContent).toContain("New review reason");
  expect(container.querySelector("output")?.textContent).toBe("Unsent reply");
  await act(async () => container.querySelector("button")!.click());
  expect(fixture.refetch).toHaveBeenCalledOnce();
});

async function renderAssignmentEditor(projectId?: string) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const props: ThreadEditorProps = {
    thread: {
      id: "thread",
      accountId: "account",
      platformThreadId: "remote-thread",
      kind: "message",
      projectId,
      contactId: "contact",
      lastInboundAt: 1,
      events: [],
    },
    accounts: [{
      id: "account", platform: "x", platformId: "remote-account", name: "Connected account",
      accountType: "member", scopes: [], accessApproved: true, connected: true,
      paused: false, executorId: "executor", grants: { project: ["read"] }, createdAt: 1,
    }],
    projects: [{ id: "project", name: "Project", cwd: "/workspace" }],
    profiles: [],
    onClose: vi.fn(),
  };
  fixture.current = fullPage(props.thread);
  root = createRoot(container);
  const render = () => root.render(createElement(ThreadEditor, props));
  await act(async () => render());
  return { props, render };
}

it("keeps an unsaved reply when project assignment succeeds", async () => {
  const { props, render } = await renderAssignmentEditor();
  act(() => fixture.edit!("Reply composed before choosing a project"));
  act(() => fixture.chooseProject!("project"));
  expect(fixture.assign).toHaveBeenCalledWith(
    expect.objectContaining({ action: "thread.assign", input: { id: "thread", projectId: "project" } }),
    expect.anything(),
  );
  await act(async () => fixture.assign.mock.calls[0][1].onSuccess());
  fixture.current = fullPage({ ...props.thread, projectId: "project" });
  await act(async () => render());
  expect(props.onClose).not.toHaveBeenCalled();
  expect(container.querySelector("output")?.textContent).toBe("Reply composed before choosing a project");
  expect(fixture.guard).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: true }));
  expect(fixture.save).not.toHaveBeenCalled();
});

it("preserves input arriving during pending project assignment", async () => {
  const { props, render } = await renderAssignmentEditor();
  act(() => fixture.chooseProject!("project"));
  fixture.pending = true;
  await act(async () => render());
  // Native input already queued before the disabled field renders can still arrive.
  act(() => {
    fixture.edit!("A newer reply");
    fixture.assign.mock.calls[0][1].onSuccess();
  });
  expect(props.onClose).not.toHaveBeenCalled();
  expect(container.querySelector("output")?.textContent).toBe("A newer reply");
});

it("still closes a clean editor after successful project assignment", async () => {
  const { props } = await renderAssignmentEditor();
  act(() => fixture.chooseProject!("project"));
  await act(async () => fixture.assign.mock.calls[0][1].onSuccess());
  expect(props.onClose).toHaveBeenCalledOnce();
});

it("keeps newer reply input when an earlier draft save completes", async () => {
  const { props, render } = await renderAssignmentEditor("project");
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  fixture.save.mockImplementation(async (_request, options) => {
    await pending;
    options.onSuccess();
  });
  act(() => fixture.edit!("Submitted reply"));
  let saving!: Promise<unknown>;
  await act(async () => { saving = fixture.submit!(); });
  expect(fixture.save).toHaveBeenCalledWith(expect.objectContaining({
    action: "replies.draft", input: { threadId: "thread", text: "Submitted reply", factIds: [] },
  }), expect.anything());
  fixture.pending = true;
  await act(async () => render());
  await act(async () => {
    fixture.edit!("Newer unsaved reply");
    release();
    await saving;
  });
  expect(props.onClose).not.toHaveBeenCalled();
  expect(container.querySelector("output")?.textContent).toBe("Newer unsaved reply");
  expect(fixture.guard).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: true }));
});

it("marks an unchanged reply saved and closes only after draft save succeeds", async () => {
  const { props } = await renderAssignmentEditor("project");
  fixture.save.mockImplementation(async (_request, options) => options.onSuccess());
  act(() => fixture.edit!("Submitted reply"));
  await act(async () => { await fixture.submit!(); });
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(fixture.guard).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: false }));
});

it("keeps the reply dirty and open when saving fails", async () => {
  const { props } = await renderAssignmentEditor("project");
  fixture.save.mockRejectedValue(new Error("Connection interrupted"));
  act(() => fixture.edit!("Unsent reply"));
  await act(async () => {
    await expect(fixture.submit!()).rejects.toThrow("Connection interrupted");
  });
  expect(props.onClose).not.toHaveBeenCalled();
  expect(container.querySelector("output")?.textContent).toBe("Unsent reply");
  expect(fixture.guard).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: true }));
});

it("loads only bounded selected pages, preserves complete content and keeps the draft across polling", async () => {
  const { props, render } = await renderAssignmentEditor("project");
  const events = Array.from({ length: 20 }, (_, index) => ({ id: String(index + 40), direction: "inbound" as const, text: index === 19 ? "Long message ".repeat(1000) : `Message ${index + 40}`, at: index + 40, platformId: String(index + 40) }));
  fixture.current = fullPage({ ...props.thread, events }, 40, 60);
  await act(async () => render());
  expect(container.textContent).toContain(events[19].text);
  act(() => fixture.edit!("Preserved draft"));
  const earlier = [...container.querySelectorAll("button")].find((button) => button.textContent === "Load earlier messages")!;
  act(() => earlier.click());
  let call = fixture.query.mock.lastCall!;
  expect(call[0]).toEqual(["social", "thread", "thread", "page", expect.any(String), 20]);
  expect(call[2]).toEqual({ action: "thread.page", input: { id: "thread", limit: 20, offset: 20 } });
  const olderEvents = events.map((event, index) => ({ ...event, id: String(index + 20), text: `Older ${index + 20}` }));
  fixture.current = fullPage({ ...props.thread, events: olderEvents }, 20, 60);
  await act(async () => render());
  expect(container.textContent).toContain("Older 20");
  expect(container.querySelector("output")?.textContent).toBe("Preserved draft");
  // New inbound content changes the total, not the explicitly selected offset.
  fixture.current = fullPage({ ...props.thread, events: olderEvents }, 20, 61);
  await act(async () => render());
  expect(fixture.query.mock.lastCall![2].input.offset).toBe(20);
  expect(container.textContent).toContain("Older 20");
  const latest = [...container.querySelectorAll("button")].find((button) => button.textContent === "Jump to latest")!;
  act(() => latest.click());
  call = fixture.query.mock.lastCall!;
  expect(call[2]).toEqual({ action: "thread.page", input: { id: "thread", limit: 20 } });
  expect(container.querySelector("output")?.textContent).toBe("Preserved draft");
});

it("rejects unbounded/preview/other-record responses and never falls back to thread.read", async () => {
  const { props, render } = await renderAssignmentEditor("project");
  const queryFn = fixture.query.mock.lastCall![3].queryFn;
  const request = vi.fn().mockResolvedValue(props.thread);
  const signal = new AbortController().signal;
  await expect(queryFn({ request }, signal)).rejects.toThrow("does not support paged conversation history");
  expect(request).toHaveBeenCalledExactlyOnceWith("social.request", { action: "thread.page", input: { id: "thread", limit: 20 } }, { signal });
  request.mockRejectedValue(new Error("Unsupported social operation."));
  await expect(queryFn({ request }, signal)).rejects.toThrow("Update bycoda");
  expect(request.mock.calls.every((call) => call[1].action === "thread.page")).toBe(true);
  act(() => fixture.edit!("Keep this draft"));
  fixture.current = { ...props.thread, eventsPreview: true };
  await act(async () => render());
  expect(container.textContent).toContain("Reply editing is unavailable");
  expect(fixture.disabled).toBe(true);
  await act(async () => { await fixture.submit!(); });
  expect(fixture.save).not.toHaveBeenCalled();
  expect(container.querySelector("output")?.textContent).toBe("Keep this draft");
  fixture.current = fullPage({ ...props.thread, id: "another-thread" });
  await act(async () => render());
  expect(fixture.disabled).toBe(true);
});

it.each([
  ["endpoint", "https://two.example"],
  ["environmentId", "other-environment"],
  ["lanKey", "another-private-key"],
] as const)("pins the opening %s and retains the draft read-only across same-ID re-pairing", async (field, value) => {
  const { props, render } = await renderAssignmentEditor();
  const events = Array.from({ length: 20 }, (_, index) => ({ id: String(index + 40), platformId: String(index + 40), text: "Old connection content", at: index, direction: "inbound" as const }));
  fixture.current = fullPage({ ...props.thread, events }, 40, 60);
  await act(async () => render());
  act(() => fixture.edit!("Draft for the opening computer"));
  const earlier = [...container.querySelectorAll("button")].find((button) => button.textContent === "Load earlier messages")!;
  act(() => earlier.click());
  const oldRead = fixture.query.mock.lastCall![3].queryFn;
  const firstKey = JSON.stringify(fixture.query.mock.lastCall![0]);
  expect(firstKey).not.toContain("private-key");
  expect(firstKey).not.toContain("https://one.example");
  const oldAssign = fixture.chooseProject!;
  const oldSave = fixture.submit!;
  fixture.machine = { ...fixture.machine, [field]: value };
  // Callbacks already queued by native UI must check the store before a rerender.
  act(() => oldAssign("project"));
  await act(async () => { await oldSave(); });
  const request = vi.fn();
  await expect(oldRead({ request }, new AbortController().signal)).rejects.toThrow("computer connection changed");
  expect(request).not.toHaveBeenCalled();
  await act(async () => render());
  expect(JSON.stringify(fixture.query.mock.lastCall![0])).not.toBe(firstKey);
  expect(JSON.stringify(fixture.query.mock.lastCall![0])).not.toContain(value);
  expect(fixture.query.mock.lastCall![2].input).toEqual({ id: "thread", limit: 20 });
  expect(fixture.query.mock.lastCall![3].enabled).toBe(false);
  expect(container.textContent).toContain("reopen this view");
  expect(container.textContent).not.toContain("Old connection content");
  expect(container.textContent).not.toContain("Connected account");
  expect(container.querySelector("output")?.textContent).toBe("Draft for the opening computer");
  expect(fixture.disabled).toBe(true);
  expect(fixture.save).not.toHaveBeenCalled();
  expect(fixture.assign).not.toHaveBeenCalled();
  expect(props.onClose).not.toHaveBeenCalled();
});

it("rejects a late read and a pending policy check after the saved connection is re-paired", async () => {
  const { props, render } = await renderAssignmentEditor("project");
  const read = fixture.query.mock.lastCall![3].queryFn;
  let resolveRead!: (value: SocialThread) => void;
  const request = vi.fn(() => new Promise<SocialThread>((resolve) => { resolveRead = resolve; }));
  const pendingRead = read({ request }, new AbortController().signal);
  const readRejected = expect(pendingRead).rejects.toThrow("computer connection changed");
  let releasePolicy!: () => void;
  fixture.fresh.mockImplementation(() => new Promise<void>((resolve) => { releasePolicy = resolve; }));
  act(() => fixture.edit!("Draft waiting for policy"));
  let saving!: Promise<unknown>;
  await act(async () => { saving = fixture.submit!(); });
  fixture.machine = { ...fixture.machine, endpoint: "https://two.example" };
  resolveRead(fullPage(props.thread));
  await readRejected;
  const saveRejected = expect(saving).rejects.toThrow("computer connection changed");
  await act(async () => { releasePolicy(); await saveRejected; });
  await act(async () => render());
  expect(fixture.save).not.toHaveBeenCalled();
  expect(props.onClose).not.toHaveBeenCalled();
  expect(container.querySelector("output")?.textContent).toBe("Draft waiting for policy");
  expect(fixture.guard).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: true }));
});

it("does not clean or close the retained draft when an old connection's save completes late", async () => {
  const { props, render } = await renderAssignmentEditor("project");
  let release!: () => void;
  fixture.save.mockImplementation(async (_request, options) => {
    await new Promise<void>((resolve) => { release = resolve; });
    options.onSuccess();
  });
  act(() => fixture.edit!("Keep the old-host draft"));
  let saving!: Promise<unknown>;
  await act(async () => { saving = fixture.submit!(); });
  fixture.machine = { ...fixture.machine, lanKey: "re-paired-key" };
  const rejected = expect(saving).rejects.toThrow("computer connection changed");
  await act(async () => { release(); await rejected; });
  await act(async () => render());
  expect(props.onClose).not.toHaveBeenCalled();
  expect(fixture.guard).toHaveBeenLastCalledWith(expect.objectContaining({ dirty: true }));
  expect(container.querySelector("output")?.textContent).toBe("Keep the old-host draft");
});

it("ignores a late project-assignment success after the same saved machine is re-paired", async () => {
  const { props, render } = await renderAssignmentEditor();
  act(() => fixture.chooseProject!("project"));
  expect(fixture.assign).toHaveBeenCalledOnce();
  fixture.machine = { ...fixture.machine, environmentId: "replacement-environment" };
  await act(async () => fixture.assign.mock.calls[0][1].onSuccess());
  await act(async () => render());
  expect(props.onClose).not.toHaveBeenCalled();
  expect(container.textContent).toContain("reopen this view");
  expect(fixture.disabled).toBe(true);
});

it("keeps the recipient, owned account/platform and assigned project distinct in the detail header", async () => {
  const { props, render } = await renderAssignmentEditor("project");
  props.recipientLabel = "Ada · remote-recipient";
  await act(async () => render());
  expect(container.textContent).toContain("Ada · remote-recipient");
  expect(container.textContent).toContain("Connected account · X");
  expect(container.textContent).toContain("Project: Project");
  props.recipientLabel = undefined;
  await act(async () => render());
  expect(container.textContent).toContain("contact");
  fixture.machine = { ...fixture.machine, environmentId: "other-environment" };
  await act(async () => render());
  expect(container.textContent).not.toContain("remote-recipient");
  expect(container.textContent).not.toContain("Connected account");
  expect(container.textContent).not.toContain("Project: Project");
});

it("keeps background thread polling quiet and identifies only a held manual refresh", async () => {
  const { render } = await renderAssignmentEditor("project");
  const refresh = () => [...container.querySelectorAll("button")].find((node) => node.textContent === "Refresh")!;
  fixture.fetching = true;
  await act(async () => render());
  expect(refresh().hasAttribute("aria-busy")).toBe(false);
  fixture.fetching = false;
  await act(async () => render());
  let release!: () => void;
  fixture.refetch.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
  await act(async () => { refresh().click(); refresh().click(); });
  expect(fixture.refetch).toHaveBeenCalledOnce();
  expect(refresh().getAttribute("aria-busy")).toBe("true");
  await act(async () => release());
  expect(refresh().hasAttribute("aria-busy")).toBe(false);
});

it("keeps the initiating earlier-page control mounted while the uncached page loads", async () => {
  const { props, render } = await renderAssignmentEditor("project");
  const thread = { ...props.thread, events: Array.from({ length: 20 }, (_, index) => ({ id: String(index), platformId: `remote-${index}`, text: `Message ${index}`, direction: "inbound" as const, at: index })) };
  fixture.current = fullPage(thread, 40, 60);
  await act(async () => render());
  const earlier = () => [...container.querySelectorAll("button")].find((node) => node.textContent === "Load earlier messages")!;
  const refresh = () => [...container.querySelectorAll("button")].find((node) => node.textContent === "Refresh")!;
  fixture.heldOffset = 20;
  const before = earlier();
  await act(async () => { before.click(); before.click(); });
  expect(earlier()).toBe(before);
  expect(earlier().getAttribute("aria-busy")).toBe("true");
  expect(refresh().hasAttribute("aria-busy")).toBe(false);
  expect(fixture.query).toHaveBeenLastCalledWith(expect.anything(), "social.request", expect.objectContaining({ input: { id: "thread", limit: 20, offset: 20 } }), expect.anything());
  fixture.heldOffset = undefined;
  fixture.current = fullPage(thread, 20, 60);
  await act(async () => render());
  expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  expect(container.textContent).toContain("Next");
});
