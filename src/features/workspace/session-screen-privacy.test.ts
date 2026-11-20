// @vitest-environment jsdom
import { act, createElement, useEffect, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { SessionScreen } from "./session-screen";
const state = vi.hoisted(() => ({
  readable: true,
  pending: false,
  parked: false,
  visibleIds: ["visible"] as string[],
  title: "",
  mounted: 0,
  privacyUnavailable: false,
  projectError: null as unknown,
  snapshotError: null as unknown,
  projectRefetch: vi.fn(),
  snapshotRefetch: vi.fn(),
  navigate: vi.fn(),
  options: undefined as undefined | { enabled: boolean; projectId?: string },
  command: vi.fn(async (_input: Record<string, unknown>) => ({})),
  onCommand: undefined as undefined | ((input: Record<string, unknown>) => Promise<unknown>),
}));
vi.mock("@/ui/machine-bar", () => ({ useMachineStatus: () => ({ phase: "connected" }) }));
// React Native defines __DEV__ at bundle start; modules read it while being imported.
vi.hoisted(() => { (globalThis as { __DEV__?: boolean }).__DEV__ = false; });
vi.mock("react-native", () => ({
  View: ({ children, style, ...props }: PropsWithChildren<Record<string, unknown>>) => {
    const {
      pointerEvents: _p,
      accessibilityElementsHidden: _a,
      importantForAccessibility: _i,
      ...rest
    } = props;
    return createElement("div", { ...rest, style }, children);
  },
}));
vi.mock("expo-router", () => ({
  router: { push: state.navigate },
  useFocusEffect: () => undefined,
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ left: 0, right: 0 }),
}));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({ id: "machine", name: "Design computer", environmentId: "host" }),
}));
vi.mock("@/state/queries", () => ({
  hostKey: (machine: string, key: unknown[]) => ["machine", machine, ...key],
}));
vi.mock("@/ui/tokens", () => ({
  colors: {},
  metrics: { contentWidth: 800 },
  space: { screen: 16, xs: 4 },
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./use-project-directory", () => ({
  useProjectList: () => ({
    readable: state.readable,
    privacyPending: state.pending || state.privacyUnavailable,
    directoryReady:
      state.readable && !state.pending && !state.privacyUnavailable && !state.projectError,
    privacyUnavailable: state.privacyUnavailable,
    readiness: state.projectError
      ? "error"
      : state.pending
        ? "loading"
        : state.privacyUnavailable
          ? "sync-required"
          : state.readable
            ? "ready"
            : "waiting",
    data:
      state.readable && !state.pending && !state.projectError
        ? state.visibleIds.map((id) => ({ id, name: `Project ${id}` }))
        : undefined,
    isProjectVisible: (id: string) =>
      state.readable &&
      !state.pending &&
      !state.privacyUnavailable &&
      state.visibleIds.includes(id),
    isPending: state.pending,
    isFetching: state.pending,
    error: state.projectError,
    refetch: state.projectRefetch,
  }),
}));
vi.mock("./session-queries", async () => {
  const { useQueryClient } = await import("@tanstack/react-query");
  return {
    useSessionSnapshot: (
      scope: { machineId: string; sessionId: string },
      options: { enabled: boolean; projectId?: string },
    ) => {
      state.options = options;
      const queryCache = useQueryClient();
      const data = state.parked
        ? undefined
        : queryCache.getQueryData(["machine", scope.machineId, "session", scope.sessionId]);
      return {
        data,
        parked: state.parked,
        refetch: state.snapshotRefetch,
        error: state.snapshotError,
        isPending: !data && !state.snapshotError,
        isFetching: !data && !state.snapshotError,
      };
    },
  };
});
vi.mock("./shared", () => ({
  UncertainCommand: class extends Error {},
  useCommands: () => ({ mutateAsync: state.command, reset() {}, isPending: false, error: null }),
}));
vi.mock("./session-project-recovery", () => ({
  SessionProjectRecovery: () => createElement("div", null, "Recover project link"),
}));
vi.mock("./session-composer", () => ({
  SessionComposer: ({ onCommand }: { onCommand: typeof state.onCommand }) => {
    const [draft] = useState("Preserved owner draft");
    state.onCommand = onCommand;
    useEffect(() => {
      state.mounted += 1;
    }, []);
    return createElement("input", { "aria-label": "Composer", value: draft, readOnly: true });
  },
}));
vi.mock("./session-keyboard-frame", () => ({
  SessionKeyboardFrame: ({
    children,
    composer,
  }: PropsWithChildren<{ composer: import("react").ReactNode }>) =>
    createElement("div", null, children, composer),
}));
vi.mock("./session-header", () => ({
  SessionHeader: ({
    title,
    context,
    actions,
  }: {
    title: string;
    context?: string;
    actions?: import("react").ReactNode;
  }) => {
    state.title = title;
    return createElement("header", null, title, context, actions);
  },
}));
vi.mock("./session-toolbar", () => ({
  SessionToolbar: ({ contextLabel, onFind }: { contextLabel?: string; onFind: () => void }) =>
    createElement(
      "p",
      null,
      "Private toolbar",
      contextLabel,
      createElement("button", { onClick: onFind }, "Find in messages"),
    ),
}));
vi.mock("./session-transcript", () => ({
  SessionTranscript: ({
    session,
    findOpen,
    onFindOpenChange,
  }: {
    session?: unknown;
    findOpen: boolean;
    onFindOpenChange: (open: boolean) => void;
  }) =>
    session
      ? createElement(
          "div",
          { "data-find-open": findOpen },
          "Secret transcript",
          findOpen
            ? createElement("button", { onClick: () => onFindOpenChange(false) }, "Close find")
            : null,
        )
      : null,
}));
vi.mock("./session-parent-bar", () => ({ SessionParentBar: () => null }));
vi.mock("./session-agents", () => ({
  SessionAgents: ({ children }: { children: (chip: null) => import("react").ReactNode }) =>
    children(null),
}));
vi.mock("./session-settings", () => ({ SessionSettings: () => null }));
// Loopback opening has its own tests; it reaches the native Host socket module and the Expo runtime.
vi.mock("./session-loopback-browser", () => ({
  SessionLoopbackBrowser: ({ children }: PropsWithChildren) => children,
}));
vi.mock("./session-list-sheet", () => ({ SessionListSheet: () => null }));
// Read acknowledgement has its own tests; its connection scope needs the Expo runtime.
vi.mock("./use-session-viewed", () => ({ useSessionViewed: () => {} }));
vi.mock("./transcript-skeleton", () => ({
  TranscriptSkeleton: ({ label }: { label?: string }) =>
    createElement("div", { "data-query": "loading" }, label ?? "Loading"),
}));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const feedback = ({
    message,
    title,
    detail,
    description,
    onRetry,
    action,
  }: {
    message?: string;
    title?: string;
    detail?: string;
    description?: string;
    onRetry?: () => void;
    action?: { label: string; onPress: () => void };
  }) =>
    createElement(
      "div",
      null,
      message ?? title,
      detail,
      description,
      onRetry ? createElement("button", { onClick: onRetry }, "Retry") : null,
      action ? createElement("button", { onClick: action.onPress }, action.label) : null,
    );
  return {
    Screen: Wrapper,
    Empty: feedback,
    Notice: feedback,
    StateView: feedback,
    QueryState: ({
      query,
      loadingLabel,
    }: {
      query: { isPending?: boolean; error?: unknown };
      loadingLabel?: string;
    }) =>
      query.error
        ? createElement("div", { "data-query": "error" }, "Query error")
        : query.isPending
          ? createElement("div", { "data-query": "loading" }, loadingLabel ?? "Loading")
          : null,
  };
});
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
let cache: QueryClient;
const session = (projectId = "visible") => ({
  projectId,
  revision: 1,
  status: "idle",
  session: { id: "session", title: "Private title", blocks: [] },
});
async function render(projectId: string | null = "visible") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container ??= document.createElement("div");
  root ??= createRoot(container);
  cache ??= new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root!.render(
      createElement(
        QueryClientProvider,
        { client: cache },
        createElement(SessionScreen, { id: "session", projectId: projectId ?? undefined }),
      ),
    ),
  );
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container = undefined as never;
  cache?.clear();
  cache = undefined as never;
  state.readable = true;
  state.pending = false;
  state.visibleIds = ["visible"];
  state.mounted = 0;
  state.options = undefined;
  state.command.mockClear();
  state.onCommand = undefined;
  state.privacyUnavailable = false;
  state.projectError = null;
  state.snapshotError = null;
  state.parked = false;
  state.projectRefetch.mockClear();
  state.snapshotRefetch.mockClear();
  state.navigate.mockClear();
  vi.unstubAllGlobals();
});
it("binds new commands to the displayed authority without blessing older callbacks or queued legacy intents", async () => {
  cache = new QueryClient();
  const key = ["machine", "machine", "session", "session"];
  cache.setQueryData(key, { ...session(), authorityGeneration: 2 });
  await render();
  const oldDisplayedCommand = state.onCommand!;
  // A head update alone must not upgrade an intent made from the old displayed view.
  cache.setQueryData(key, { ...session(), authorityGeneration: 3 });
  await oldDisplayedCommand({ type: "send", sessionId: "session" });
  expect(state.command).toHaveBeenLastCalledWith(
    expect.objectContaining({ authorityGeneration: 2 }),
  );
  await render();
  await state.onCommand!({ type: "cancel", sessionId: "session" });
  expect(state.command).toHaveBeenLastCalledWith(
    expect.objectContaining({ authorityGeneration: 3 }),
  );
  await state.onCommand!({ type: "send", sessionId: "session", authorityGeneration: undefined });
  expect(state.command.mock.calls.at(-1)?.[0]).toHaveProperty("authorityGeneration", undefined);
  await state.onCommand!({ type: "send", sessionId: "session", authorityGeneration: 2 });
  expect(state.command).toHaveBeenLastCalledWith(
    expect.objectContaining({ authorityGeneration: 2 }),
  );
});
it("opens find from the header without replacing the transcript or composer draft", async () => {
  cache = new QueryClient();
  cache.setQueryData(["machine", "machine", "session", "session"], session());
  await render();
  const input = container.querySelector("input")!;
  const transcript = container.querySelector("[data-find-open]")!;
  const button = (label: string) =>
    [...container.querySelectorAll("button")].find((node) => node.textContent === label)!;
  expect(transcript.getAttribute("data-find-open")).toBe("false");
  await act(async () => button("Find in messages").click());
  expect(transcript.getAttribute("data-find-open")).toBe("true");
  await act(async () => button("Close find").click());
  expect(transcript.getAttribute("data-find-open")).toBe("false");
  expect(container.querySelector("[data-find-open]")).toBe(transcript);
  expect(container.querySelector("input")).toBe(input);
  expect(input.value).toBe("Preserved owner draft");
  expect(state.mounted).toBe(1);
  expect(state.command).not.toHaveBeenCalled();
});

it("wrong-project cached deep links never display a private title/transcript or enable fetching", async () => {
  cache = new QueryClient();
  cache.setQueryData(["machine", "machine", "session", "session"], session("hidden"));
  await render();
  expect(state.title).toBe("Session");
  expect(container.textContent).not.toContain("Secret transcript");
  expect(container.textContent).not.toContain("Design computer");
  expect(state.options?.enabled).toBe(false);
  await expect(state.onCommand!({ type: "send" })).rejects.toThrow("no longer available");
  expect(state.command).not.toHaveBeenCalled();
});
it("rechecks a previously loaded canonical session when reopened through a visible legacy alias, without displaying its cached transcript", async () => {
  state.visibleIds = ["visible", "canonical"];
  cache = new QueryClient();
  cache.setQueryData(["machine", "machine", "session", "session"], session("canonical"));
  await render();
  expect(container.textContent).toContain("Recover project link");
  expect(container.textContent).not.toContain("Private title");
  expect(container.textContent).not.toContain("Secret transcript");
  expect(state.options?.enabled).toBe(false);
});

it("retains only project navigation identity and the same composer after inactive payload eviction", async () => {
  cache = new QueryClient();
  cache.setQueryData(["machine", "machine", "session", "session"], session());
  await render(null);
  const input = container.querySelector("input")!;
  expect(input.value).toBe("Preserved owner draft");
  state.parked = true;
  await render(null);
  cache.removeQueries({ queryKey: ["machine", "machine", "session", "session"], exact: true });
  await render(null);
  expect(container.textContent).not.toContain("Secret transcript");
  state.parked = false;
  await render(null);
  expect(state.options).toMatchObject({ enabled: true, projectId: "visible" });
  expect(container.querySelector("input")).toBe(input);
  expect(input.value).toBe("Preserved owner draft");
  state.visibleIds = [];
  await render(null);
  expect(state.options?.enabled).toBe(false);
});
it("normal visibility shows exact content, then conceals on lock/revoke/pending without remounting the composer", async () => {
  cache = new QueryClient();
  cache.setQueryData(["machine", "machine", "session", "session"], session());
  await render();
  expect(state.title).toBe("Private title");
  expect(container.textContent).toContain("Design computer · Project visible");
  expect(state.options?.enabled).toBe(true);
  const input = container.querySelector("input")!;
  expect(state.mounted).toBe(1);
  state.readable = false;
  await render();
  expect(state.title).toBe("Session");
  expect(state.options?.enabled).toBe(false);
  expect(container.querySelector("input")).toBe(input);
  expect(state.mounted).toBe(1);
  let node: HTMLElement | null = input;
  let concealed = false;
  while (node) {
    if (node.style.display === "none" && node.getAttribute("aria-hidden") === "true")
      concealed = true;
    node = node.parentElement;
  }
  expect(concealed).toBe(true);
  state.readable = true;
  state.pending = true;
  await render();
  expect(state.options?.enabled).toBe(false);
  state.pending = false;
  await render();
  expect(state.title).toBe("Private title");
  expect(container.querySelector("input")).toBe(input);
});
it("a stale command callback rechecks live project visibility before dispatch", async () => {
  cache = new QueryClient();
  cache.setQueryData(["machine", "machine", "session", "session"], session());
  await render();
  const send = state.onCommand!;
  state.visibleIds = [];
  await expect(send({ type: "send" })).rejects.toThrow("no longer available");
  expect(state.command).not.toHaveBeenCalled();
});
it("initial directory loading shows one verification state without hidden-project or desktop-sync guidance", async () => {
  state.pending = true;
  await render();
  expect(state.options?.enabled).toBe(false);
  expect(container.textContent).toContain("Verifying project…");
  expect(container.querySelectorAll('[data-query="loading"]')).toHaveLength(1);
  expect(container.textContent).not.toMatch(/hidden|not found|sync|session list/i);
});
it("a failed directory load shows its retryable query error without claiming the project is hidden", async () => {
  state.projectError = new Error("Host unavailable");
  await render();
  expect(container.querySelectorAll('[data-query="error"]')).toHaveLength(1);
  expect(container.textContent).not.toMatch(/hidden|not found|sync|session list/i);
  expect(state.options?.enabled).toBe(false);
});
it("verified project identity loads the transcript with a single labelled state", async () => {
  await render();
  expect(state.options?.enabled).toBe(true);
  expect(container.textContent).toContain("Loading session…");
  expect(container.querySelectorAll('[data-query="loading"]')).toHaveLength(1);
  expect(container.textContent).not.toMatch(/hidden|not found|sync/i);
});
it("an explicit unsynchronized directory gives an in-place directory retry", async () => {
  state.privacyUnavailable = true;
  await render();
  expect(container.textContent).toContain("sync the project directory");
  await act(async () => container.querySelector("button")!.click());
  expect(state.projectRefetch).toHaveBeenCalledOnce();
  expect(state.snapshotRefetch).not.toHaveBeenCalled();
  expect(state.options?.enabled).toBe(false);
});
it("a session link without project identity offers the session list without fetching a transcript", async () => {
  await render(null);
  expect(container.textContent).toContain(
    "Open this session from the session list to verify its project.",
  );
  await act(async () => container.querySelector("button")!.click());
  expect(state.navigate).toHaveBeenCalledWith("/sessions");
  expect(state.options?.enabled).toBe(false);
});
it("directory verification and transcript arrival preserve the mounted draft owner", async () => {
  state.pending = true;
  await render();
  const input = container.querySelector("input")!;
  expect(state.mounted).toBe(1);
  state.pending = false;
  await render();
  expect(container.textContent).toContain("Loading session…");
  cache.setQueryData(["machine", "machine", "session", "session"], session());
  await render();
  expect(state.title).toBe("Private title");
  expect(container.querySelector("input")).toBe(input);
  expect(state.mounted).toBe(1);
  expect(container.querySelectorAll('[data-query="loading"]')).toHaveLength(0);
});
