// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ThreadEditor } from "./thread-editor";
import type { SocialThread } from "@/domain/types";

const fixture = vi.hoisted(() => ({
  query: vi.fn(),
  refetch: vi.fn(),
  current: undefined as unknown,
  edit: undefined as undefined | ((value: string) => void),
}));
vi.mock("@/ui/motion", () => ({ haptic: { success: vi.fn() } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({ requestClose: vi.fn() }) }));
vi.mock("@/state/queries", () => ({
  useHostQuery: (...args: unknown[]) => {
    fixture.query(...args);
    return { data: fixture.current, refetch: fixture.refetch, isFetching: false };
  },
  useHostMutation: () => ({ isPending: false }),
}));
vi.mock("@/state/actions", () => ({ useAsyncAction: () => ({ isPending: false }) }));
vi.mock("./policy", () => ({
  usePolicy: () => ({ data: { effective: {} } }),
  freshPolicy: vi.fn(),
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
    QueryState: () => null,
    MutationState: () => null,
    SelectField: () => null,
    FormActions: () => null,
    Field: ({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) => {
      fixture.edit = onChangeText;
      return createElement("output", null, value);
    },
    Button: ({ label, onPress }: { label: string; onPress: () => void }) =>
      createElement("button", { onClick: onPress }, label),
  };
});
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("refreshes detail events/review feedback without resetting the open reply draft", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const thread = {
    id: "thread",
    accountId: "account",
    projectId: "project",
    kind: "message",
    events: [{ id: "old", direction: "inbound", text: "Old message", at: 1 }],
  } as SocialThread;
  fixture.current = thread;
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
    ["social", "thread", "thread"],
    "social.request",
    { action: "thread.read", input: { id: "thread" } },
    { interval: 8000 },
  );
  act(() => fixture.edit!("Unsent reply"));
  fixture.current = {
    ...thread,
    reviewReason: "New review reason",
    events: [...thread.events, { id: "new", direction: "inbound", text: "New message", at: 2 }],
  };
  await act(async () => render());
  expect(container.textContent).toContain("New message");
  expect(container.textContent).toContain("New review reason");
  expect(container.querySelector("output")?.textContent).toBe("Unsent reply");
  await act(async () => container.querySelector("button")!.click());
  expect(fixture.refetch).toHaveBeenCalledOnce();
});
