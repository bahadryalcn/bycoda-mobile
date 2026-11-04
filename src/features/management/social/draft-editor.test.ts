// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DraftEditor } from "./draft-editor";
import type { SocialDraft } from "./types";

const calls = vi.hoisted(() => ({
  mutate: vi.fn().mockResolvedValue({}),
  form: undefined as undefined | (() => Promise<unknown>),
}));
vi.mock("expo-crypto",()=>({randomUUID:()=>"draft-editor-epoch"}));
vi.mock("@/state/machines",()=>({useMachines:{
  getState:()=>({activeId:"machine",machines:[{id:"machine",endpoint:"https://fixture.invalid"}]}),
  subscribe:()=>()=>{},
}}));
vi.mock("@/ui/motion", () => ({ haptic: { success: vi.fn() } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({ requestClose: vi.fn() }) }));
vi.mock("@/state/queries", () => ({
  useHostMutation: () => ({ mutateAsync: calls.mutate, isPending: false }),
}));
vi.mock("@/state/actions", () => ({
  useAsyncAction: () => ({ run: (action: () => Promise<unknown>) => action(), isPending: false }),
}));
vi.mock("./policy", () => ({
  usePolicy: () => ({ data: { effective: {} } }),
  freshPolicy: async () => ({ effective: {} }),
  PolicyInfo: () => null,
  PolicyCounter: () => null,
}));
vi.mock("./fact-choices", () => ({ FactChoices: () => null }));
vi.mock("../shared/format", () => ({ identifier: () => "request" }));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Stack: wrapper,
    Body: wrapper,
    Card: wrapper,
    Heading: wrapper,
    QueryState: () => null,
    MutationState: () => null,
    Field: () => null,
    FormActions: ({ onSubmit }: { onSubmit: () => Promise<unknown> }) => {
      calls.form = onSubmit;
      return null;
    },
  };
});

const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.unstubAllGlobals();
  calls.mutate.mockClear();
});

it("keeps the original expected draft when polling refreshes the same open editor", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const draft: SocialDraft = {
    id: "draft",
    accountId: "account",
    projectId: "project",
    kind: "message",
    contactId: "recipient",
    text: "Original",
    factIds: [],
    createdAt: 1,
  };
  const opening = JSON.parse(JSON.stringify(draft));
  root = createRoot(container);
  await act(async () => root.render(createElement(DraftEditor, { draft, onClose: vi.fn() })));
  await act(async () =>
    root.render(
      createElement(DraftEditor, {
        draft: { ...draft, text: "Newer remote text" },
        onClose: vi.fn(),
      }),
    ),
  );
  await act(async () => {
    await calls.form!();
  });
  expect(calls.mutate).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "drafts.update",
      input: { id: draft.id, text: "Original", factIds: [], expectedDraft: opening },
    }),
    expect.anything(),
  );
});
