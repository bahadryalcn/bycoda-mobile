// @vitest-environment happy-dom
import { act, createElement, type ComponentProps, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { GitLinkPullRequestSheet } from "./git-link-pr";
const fixture = vi.hoisted(() => ({
  input: undefined as undefined | { value: string; onChangeText(value: string): void },
  submit: undefined as undefined | (() => void),
  close: undefined as undefined | (() => void),
  mutate: vi.fn(),
}));
vi.mock("./pull-request-state-badge", () => ({ PullRequestStateBadge: ({ label }: { label: string }) => createElement("span", null, label) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ capabilities: [] }) }));
vi.mock("@/state/queries", () => ({
  useHostQuery: () => ({}),
  useHostMutation: () => ({ isPending: false, mutateAsync: fixture.mutate }),
}));
vi.mock("@/ui/primitives", () => {
  const Box = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Body: Box,
    Stack: Box,
    Badge: () => null,
    ErrorNotice: () => null,
    Sheet: ({ children, onClose }: PropsWithChildren<{ onClose(): void }>) => {
      fixture.close = onClose;
      return createElement(Box, null, children);
    },
    Input: (props: NonNullable<typeof fixture.input>) => {
      fixture.input = props;
      return createElement("output", null, props.value);
    },
    FormActions: ({ submitLabel, onSubmit }: { submitLabel: string; onSubmit(): void }) => {
      if (submitLabel === "Link") fixture.submit = onSubmit;
      return null;
    },
  };
});
import { GitLinkPullRequestSheet as Sheet } from "./git-link-pr";
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  fixture.mutate.mockReset();
  vi.unstubAllGlobals();
});
it("retains a closed URL draft and keeps newer text after one in-flight link succeeds", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let finish!: (value: unknown) => void;
  fixture.mutate.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const close = vi.fn(),
    container = document.createElement("div");
  root = createRoot(container);
  const props = {
    visible: true,
    projectId: "project",
    link: { supported: true, session: { id: "session", title: "Review" }, refetch: vi.fn() },
    onClose: close,
  } as unknown as ComponentProps<typeof GitLinkPullRequestSheet>;
  await act(async () => root!.render(createElement(Sheet, props)));
  await act(async () => fixture.input!.onChangeText("https://github.com/example/project/pull/42"));
  await act(async () => fixture.close!());
  expect(close).toHaveBeenCalledOnce();
  await act(async () => root!.render(createElement(Sheet, { ...props, visible: false })));
  await act(async () => root!.render(createElement(Sheet, props)));
  expect(fixture.input!.value).toBe("https://github.com/example/project/pull/42");
  await act(async () => {
    fixture.submit!();
    fixture.submit!();
    fixture.close!();
  });
  expect(fixture.mutate).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  await act(async () => fixture.input!.onChangeText("https://github.com/example/project/pull/43"));
  await act(async () => finish({ watchId: "watch", number: 42, state: "open" }));
  expect(fixture.input!.value).toBe("https://github.com/example/project/pull/43");
});
