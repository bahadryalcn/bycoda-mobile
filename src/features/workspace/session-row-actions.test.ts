// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SessionRowActionsProps } from "./session-row-actions";
import type { HostSessionSummary } from "./wire";
import { RemoteHostError } from "@/remote/host-error";

const f = vi.hoisted(() => ({
  allowed: true,
  epoch: true,
  activeId: "machine",
  active: true,
  capabilities: ["sessions"],
  read: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  command: vi.fn(),
  invalidate: vi.fn(async () => undefined),
  confirm: undefined as (() => void) | undefined,
  cancel: undefined as (() => void) | undefined,
  changeTitle: undefined as ((value: string) => void) | undefined,
  actions: new Map<string, () => void>(),
}));
vi.mock("lucide-react-native/icons/clock", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/mail", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/mail-open", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/pencil", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/square", () => ({ default: () => null }));
vi.mock("./session-row-copy-menu", async () => {
  const { SessionActionList } = await import("./session-action-list");
  return { SessionRowCopyMenu: ({ actions }: { actions: Action[] }) => createElement(SessionActionList, { actions }) };
});
vi.mock("lucide-react-native/icons/archive", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/archive-restore", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/trash", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/git-branch", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/pin", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/pin-off", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/circle-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/undo-2", () => ({ default: () => null }));
vi.mock("./session-action-list", () => ({
  SessionActionList: ({ actions }: { actions: Action[] }) => {
    for (const action of actions) f.actions.set(action.key, action.onPress);
    return null;
  },
}));
vi.mock("lucide-react-native/icons/info", () => ({ default: () => null }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: f.invalidate }),
}));
vi.mock("@/state/machines", () => {
  const machine = {
    id: "machine",
    name: "Original computer",
    endpoint: "https://host.example",
    environmentId: "environment",
  };
  return {
    useActiveMachine: () => ({ ...machine, capabilities: f.capabilities }),
    useMachines: { getState: () => ({ activeId: f.activeId, machines: [machine] }) },
  };
});
vi.mock("@/state/connection-scope", () => {
  const scope = {
    review: { id: "machine", endpoint: "https://host.example", environmentId: "environment" },
    isCurrent: () => f.epoch,
  };
  return { useConnectionScope: () => scope };
});
vi.mock("@/state/queries", () => {
  const client = { machine: { id: "machine" } };
  return {
    useHostClient: () => client,
    useHostReadActive: () => f.active,
    hostKey: (id: string, key: unknown[]) => ["machine", id, ...key],
    useHostMutation: (method: string) => ({
      mutateAsync: method === "sessions.update" ? f.update : f.remove,
    }),
  };
});
vi.mock("@/ui/private-access", () => ({
  usePrivateContentAccess: () => ({ allowed: f.allowed, check: () => f.allowed }),
  PrivateContentAccessProvider: ({ children }: PropsWithChildren) => children,
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({
  useMobileTheme: () => ({
    mode: "dark",
    colors: { muted: "muted" },
    semanticColors: {},
    uiStyles: { title: {}, caption: {} },
  }),
}));
vi.mock("@/ui/styles", () => ({ uiStyles: { title: {}, caption: {} } }));
vi.mock("@/ui/tokens", () => ({ colors: { muted: "muted" } }));
vi.mock("@/ui/provider-identity", () => ({ ProviderIcon: () => null }));
// Status precedence is covered against the real helper in shared-relative-time.test.ts.
vi.mock("./shared", () => ({
  useCommands: () => ({ mutateAsync: f.command }),
  UncertainCommand: class extends Error {},
  relativeTime: () => "Now",
  sessionStatus: (value: { status: string; needsInput?: boolean }) => ({
    label: value.needsInput ? "Needs reply" : value.status === "running" ? "Running" : "Ready",
    color: "muted",
  }),
}));
vi.mock("../management/shared/format", () => ({
  stamp: (value?: number) => (value === undefined ? "—" : `date-${value}`),
}));
vi.mock("./wire", () => ({ readTail: (...args: unknown[]) => f.read(...args) }));
type Action = { key: string; label: string; onPress(): void; disabled?: boolean };
vi.mock("@/ui/swipe-actions", () => ({
  SwipeActions: ({ children, actions }: PropsWithChildren<{ actions: Action[] }>) => {
    for (const action of actions) f.actions.set(action.key, action.onPress);
    return createElement("main", null, children);
  },
}));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const button = ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress(): void;
    disabled?: boolean;
  }) => createElement("button", { onClick: onPress, disabled }, label);
  return {
    Body: wrapper,
    Stack: wrapper,
    Row: wrapper,
    Disclosure: wrapper,
    Button: button,
    Field: ({ value, onChangeText }: { value: string; onChangeText(value: string): void }) => {
      f.changeTitle = onChangeText;
      return createElement("input", { value, readOnly: true });
    },
    Badge: ({ label, tone }: { label: string; tone?: string }) =>
      createElement("span", { "data-tone": tone }, label),
    Sheet: ({
      children,
      title,
      onClose,
    }: PropsWithChildren<{ title: string; onClose(): void }>) => {
      f.cancel = onClose;
      return createElement("aside", null, title, children);
    },
    StatusRow: ({ children, label }: PropsWithChildren<{ label: string }>) =>
      createElement("section", null, label, children),
    Notice: ({ message }: { message: string }) => createElement("p", null, message),
    StateView: ({ title }: { title: string }) => createElement("p", null, title),
    ErrorText: ({ error }: { error?: Error }) =>
      error ? createElement("p", null, error.message) : null,
    FormActions: ({
      submitLabel,
      onSubmit,
      disabled,
    }: {
      submitLabel: string;
      onSubmit(): void;
      disabled?: boolean;
    }) => {
      f.confirm = onSubmit;
      return button({ label: submitLabel, onPress: onSubmit, disabled });
    },
  };
});
import { SessionRowActions } from "./session-row-actions";
const initial = (): HostSessionSummary => ({
  id: "session",
  projectId: "project",
  title: "A long full session title",
  harness: "codex",
  model: "model",
  status: "idle",
  revision: 3,
  updatedAt: 20,
  createdAt: 10,
  authorityGeneration: 2,
  cwd: "/project",
  branch: "main",
});
let session = initial(),
  root: ReturnType<typeof createRoot>,
  node: HTMLDivElement;
const press = async (key: string) => {
  if (!f.actions.has(key)) await act(() => (node.querySelector("button") as HTMLElement).click());
  await act(() => f.actions.get(key)!());
};
const render = async (overrides: Partial<SessionRowActionsProps> = {}) =>
  act(() =>
    root.render(
      createElement(SessionRowActions, {
        machineId: "machine",
        projectId: "project",
        projectName: "Original project",
        session,
        canRead: () => f.allowed,
        children: (open) => createElement("button", { onClick: open }, "Row menu"),
        ...overrides,
      }),
    ),
  );
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  f.allowed = true;
  f.epoch = true;
  f.activeId = "machine";
  f.active = true;
  f.capabilities = ["sessions"];
  session = initial();
  f.actions.clear();
  f.update.mockReset().mockResolvedValue({});
  f.remove.mockReset().mockResolvedValue({ deleted: true });
  f.command.mockReset().mockResolvedValue({});
  f.read.mockReset().mockImplementation(async () => ({
    ...session,
    session: { id: session.id, title: session.title },
  }));
  f.invalidate.mockClear();
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await render();
});
afterEach(() => {
  act(() => root.unmount());
  node.remove();
  vi.unstubAllGlobals();
});

it("gives a current reply request warning meaning even while the session is running", async () => {
  session = { ...session, status: "running", needsInput: true };
  await render();
  await press("details");
  const badge = [...node.querySelectorAll("[data-tone]")].find(
    (entry) => entry.textContent === "Needs reply",
  );
  expect(badge).toBeDefined();
  expect(badge?.getAttribute("data-tone")).toBe("warning");
  expect(f.read).not.toHaveBeenCalled();
  expect(f.update).not.toHaveBeenCalled();
});
it("opens full cached details without a Host read and keeps them visible during live revision changes", async () => {
  await press("details");
  expect(node.textContent).toContain("A long full session title");
  expect(node.textContent).toContain("Original project");
  expect(node.textContent).toContain("/project");
  expect(node.textContent).toContain("date-10");
  expect(node.textContent).toContain("date-20");
  expect(node.textContent).not.toContain("Duration");
  session = { ...session, revision: 4, status: "running" };
  await render();
  expect(node.querySelector("aside")).not.toBeNull();
  expect(node.textContent).toContain("Running");
  expect(f.read).not.toHaveBeenCalled();
});
it("reviews deletion, cancel does nothing, and confirmation sends once", async () => {
  await act(() => f.actions.get("delete")!());
  expect(f.remove).not.toHaveBeenCalled();
  const cancelled = f.confirm!;
  await act(() => f.cancel!());
  await act(() => cancelled());
  expect(f.remove).not.toHaveBeenCalled();
  await act(() => f.actions.get("delete")!());
  const confirm = f.confirm!;
  await act(async () => {
    confirm();
    confirm();
  });
  expect(f.remove).toHaveBeenCalledExactlyOnceWith({
    projectId: "project",
    sessionId: "session",
    authorityGeneration: 2,
  });
  expect(f.invalidate).toHaveBeenCalledWith({
    queryKey: ["machine", "machine", "project-summaries"],
  });
});
it.each(["authority", "epoch", "privacy", "machine"])(
  "retires deletion on %s changes",
  async (change) => {
    await act(() => f.actions.get("delete")!());
    const confirm = f.confirm!;
    if (change === "authority") session = { ...session, authorityGeneration: 3 };
    if (change === "epoch") f.epoch = false;
    if (change === "privacy") f.allowed = false;
    if (change === "machine") f.activeId = "other";
    await render();
    await act(() => confirm());
    expect(f.remove).not.toHaveBeenCalled();
  },
);
it("blocks archive duplicates and rejects authority drift during preflight", async () => {
  let resolve!: (value: unknown) => void;
  f.read.mockImplementation(
    () =>
      new Promise((value) => {
        resolve = value;
      }),
  );
  await press("archive");
  await act(() => {
    f.actions.get("archive")!();
  });
  expect(f.read).toHaveBeenCalledOnce();
  await act(() =>
    resolve({
      ...session,
      authorityGeneration: 8,
      session: { id: session.id, title: session.title },
    }),
  );
  expect(f.update).not.toHaveBeenCalled();
  expect(node.textContent).toContain("Refresh the list");
});
it("retains unknown archive outcome and refuses a second dispatch", async () => {
  f.update.mockRejectedValue(new RemoteHostError("machine", "timeout", "Unknown", true));
  await press("archive");
  expect(node.textContent).toContain("The result is uncertain");
  await act(async () => f.actions.get("archive")!());
  expect(f.update).toHaveBeenCalledOnce();
});
it("does not revive a delete confirmation after access disappears and returns", async () => {
  await act(() => f.actions.get("delete")!());
  const confirm = f.confirm!;
  f.allowed = false;
  await render();
  f.allowed = true;
  await render();
  await act(() => confirm());
  expect(f.remove).not.toHaveBeenCalled();
  expect(f.read).not.toHaveBeenCalled();
});
it("keeps uncertain feedback visible after the summary revision advances during a write", async () => {
  let reject!: (error: unknown) => void;
  f.update.mockImplementation(
    () =>
      new Promise((_resolve, refuse) => {
        reject = refuse;
      }),
  );
  await press("archive");
  session = { ...session, revision: 4 };
  await render();
  await act(() => reject(new RemoteHostError("machine", "timeout", "Unknown", true)));
  expect(node.querySelector("aside")).not.toBeNull();
  expect(node.textContent).toContain("The result is uncertain");
  await act(() => f.actions.get("archive")!());
  expect(f.update).toHaveBeenCalledOnce();
});
it("does not mutate read-only capability sets or wrong project rows", async () => {
  f.capabilities = ["transport.ws.read.v2"];
  await render();
  await act(() => f.actions.get("pin")!());
  await act(() => f.actions.get("settle")!());
  expect(f.update).not.toHaveBeenCalled();
  expect(f.remove).not.toHaveBeenCalled();
  f.capabilities = ["sessions"];
  await render({ projectId: "wrong" });
  await act(() => f.actions.get("pin")!());
  expect(f.update).not.toHaveBeenCalled();
  expect(f.read).not.toHaveBeenCalled();
});

it("pins through sessions.update with the displayed authority and refreshes the directory", async () => {
  await act(() => f.actions.get("pin")!());
  expect(f.update).toHaveBeenCalledExactlyOnceWith({
    projectId: "project",
    sessionId: "session",
    pinned: true,
    authorityGeneration: 2,
  });
  expect(f.invalidate).toHaveBeenCalledWith({
    queryKey: ["machine", "machine", "project-summaries"],
  });
});
it("settles through the lifecycle mutation and refreshes the settled list", async () => {
  await act(() => f.actions.get("settle")!());
  expect(f.remove).toHaveBeenCalledExactlyOnceWith({ sessionId: "session" });
  expect(f.invalidate).toHaveBeenCalledWith({
    queryKey: ["machine", "machine", "sessions-lifecycle"],
  });
});


it("keeps rename draft after failure and retries only on explicit submission", async () => {
  f.update.mockRejectedValueOnce(new Error("write failed")).mockResolvedValueOnce({});
  await press("rename");
  await act(() => f.changeTitle!("  Changed title  "));
  await act(() => f.confirm!());
  expect(node.querySelector("input")?.value).toBe("  Changed title  ");
  expect(node.textContent).toContain("write failed");
  expect(f.update).toHaveBeenCalledOnce();
  await act(() => f.confirm!());
  expect(f.update).toHaveBeenLastCalledWith({ projectId: "project", sessionId: "session", title: "Changed title", authorityGeneration: 2 });
  expect(node.querySelector("aside")).toBeNull();
});

it("requires confirmation before sending one exact-run Stop command", async () => {
  session = { ...session, status: "running", runId: "run" };
  f.capabilities = ["sessions", "transport.ws.sessions.v2"];
  await render();
  await press("stop");
  expect(node.textContent).toContain("Stop session");
  expect(f.command).not.toHaveBeenCalled();
  session = { ...session, revision: 7 };
  await render();
  const confirm = f.confirm!;
  await act(async () => { confirm(); confirm(); });
  expect(f.command).toHaveBeenCalledExactlyOnceWith({ type: "cancel", sessionId: "session", runId: "run", authorityGeneration: 2 });
});

it("writes unread and snooze with the displayed revision and authority", async () => {
  session = { ...session, unread: false, snoozedUntil: null };
  await render(); await press("unread");
  expect(f.update).toHaveBeenLastCalledWith({ projectId: "project", sessionId: "session", unread: true, expectedRevision: 3, authorityGeneration: 2 });
  f.actions.clear(); await render(); await press("snooze");
  expect(f.update).toHaveBeenCalledTimes(1);
  await press("hour");
  expect(f.update).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: "project", sessionId: "session", expectedRevision: 3, authorityGeneration: 2, snoozedUntil: expect.any(Number) }));
});
