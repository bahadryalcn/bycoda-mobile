// @vitest-environment happy-dom
import { act, createElement as h, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { assistantProfileDefaults } from "../../../../host/assistant/profile-defaults";
import { AssistantReplyModel } from "./assistant-reply-model";

const fixture = vi.hoisted(() => ({ empty: false, discovering: false }));

vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => undefined }));
vi.mock("@/state/queries", () => ({ useHostQuery: () => ({
  isSuccess: true,
  data: {
    pending: fixture.discovering ? ["codex"] : [],
    accounts: { codex: [{ id: "work", label: "Work" }] },
    models: fixture.empty ? {} : {
      codex: [{ id: "ten", name: "GPT-10" }, { id: "two", name: "GPT-2" }],
      claude: [{ id: "sonnet", name: "Sonnet" }],
    },
  },
}) }));
vi.mock("@/ui/primitives", () => ({
  Loading: ({ label }: { label: string }) => h("p", { role: "status" }, label),
  Notice: ({ message, action }: { message: string; action?: { label: string; onPress(): void } }) =>
    h("section", null, message, action ? h("button", { onClick: action.onPress }, action.label) : null), QueryState: () => null,
  StateView: ({ title }: { title: string }) => h("p", null, title),
  NavigationGroup: ({ children }: PropsWithChildren) => h("div", null, children),
  FormActions: ({ submitLabel, onSubmit, disabled }: { submitLabel: string; onSubmit(): void; disabled?: boolean }) =>
    h("button", { onClick: onSubmit, disabled, "data-save": true }, submitLabel),
}));
type Choice = { key: string; provider: string; accountId?: string };
/** The shared picker as rows: each provider choice with that provider's models. */
vi.mock("../workspace/model-picker-field", () => ({
  ModelPickerField: ({ label, disabled, choices, choice, model, catalog, onChooseModel }: {
    label: string; disabled?: boolean; choices: Choice[]; choice?: Choice; model: string;
    catalog?: { accounts?: unknown; models: Record<string, { id: string; name: string }[]> };
    onChooseModel(next: Choice, model: string, settings: Record<string, string>): void;
  }) => h("div", { "aria-label": label, "aria-disabled": !!disabled, "data-accounts": catalog?.accounts === undefined ? "none" : "listed" },
    h("span", { "data-selected-model": model, "data-selected-provider": choice?.provider }),
    ...choices.flatMap(entry => (catalog?.models[entry.provider] ?? []).map(row => h("p", {
      key: `${entry.key}:${row.id}`, "data-provider": entry.provider, "data-account": entry.accountId ?? "",
      onClick: () => onChooseModel(entry, row.id, { effort: "high" }),
    }, row.name)))),
}));

function render() {
  return renderToStaticMarkup(h(AssistantReplyModel, {
    client: {} as Parameters<typeof AssistantReplyModel>[0]["client"], projectId: "", disabled: false, onSaved: vi.fn(),
    current: () => true, reviewRequired: false, onReviewRequired: vi.fn(), onRefresh: vi.fn(),
    profile: { ...assistantProfileDefaults, replyExecution: {
      harness: "claude", model: "claude:Older", runtimeMode: "supervised", modelSettings: {}, maxRunMinutes: 5,
    } },
  }));
}

// The reply model was a plain searchable list; it now uses the shared model picker the rest of the app uses.
it("uses the shared model picker for the reply model, with providers but no accounts it cannot store", () => {
  const html = render();
  expect(html).toContain('aria-label="Reply model"');
  expect(html).toContain('data-accounts="none"');
  expect(html).toContain('data-selected-model="claude:Older" data-selected-provider="claude"');
  expect(html).not.toContain('data-account="work"');
  expect(html).toContain("GPT-2");
  expect(html).toContain("Sonnet");
});

it("explains progressive model discovery and a settled empty catalog while retaining the saved choice", () => {
  fixture.empty = true;
  fixture.discovering = true;
  try {
    const discovering = render();
    expect(discovering).toContain('role="status">Loading…');
    expect(discovering).toContain('aria-disabled="true"');
    expect(discovering).not.toContain("No models available.");
    fixture.discovering = false;
    const empty = render();
    expect(empty).toContain("No models available.");
    expect(empty).toContain('aria-disabled="true"');
    expect(empty).toContain('data-selected-model="claude:Older"');
    expect(empty).not.toContain('role="status"');
  } finally {
    fixture.empty = false;
    fixture.discovering = false;
  }
});

it("offers a first reply model and saves it, with its effort, only after an explicit selection", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const replyExecution = {
    harness: "codex" as const, model: "two", runtimeMode: "supervised" as const,
    maxRunMinutes: 60, modelSettings: { effort: "high" },
  };
  const profile = { ...assistantProfileDefaults, version: 1, replyExecution };
  const updateProfile = vi.fn().mockResolvedValue(profile);
  const onSaved = vi.fn();
  try {
    await act(async () => root.render(h(AssistantReplyModel, {
      client: { updateProfile } as unknown as Parameters<typeof AssistantReplyModel>[0]["client"],
      projectId: "", disabled: false, onSaved, profile: assistantProfileDefaults,
      current: () => true, reviewRequired: false, onReviewRequired: vi.fn(), onRefresh: vi.fn(),
    })));
    expect(container.querySelector('[aria-disabled="false"]')).not.toBeNull();
    expect(container.querySelector("[data-selected-model]")?.getAttribute("data-selected-model")).toBe("");
    expect(updateProfile).not.toHaveBeenCalled();
    const option = [...container.querySelectorAll("p")].find(row => row.textContent === "GPT-2")!;
    await act(async () => option.click());
    // Picking is a draft: nothing is written until Save.
    expect(updateProfile).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLButtonElement>("[data-save]")!.click());
    expect(updateProfile).toHaveBeenCalledExactlyOnceWith(0, { replyExecution });
    expect(onSaved).toHaveBeenCalledExactlyOnceWith(profile);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("requires a fresh Host profile before another explicit selection after a failed save", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const refreshedProfile = { ...assistantProfileDefaults, version: 2, replyExecution: {
    harness: "codex" as const, model: "two", runtimeMode: "supervised" as const, modelSettings: { effort: "high" }, maxRunMinutes: 60,
  } };
  const refresh = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(refreshedProfile);
  const updateProfile = vi.fn().mockRejectedValueOnce(new Error("Profile changed")).mockResolvedValueOnce({ ...assistantProfileDefaults, version: 3 });
  let open = true;
  function Workspace() {
    const [reviewRequired, onReviewRequired] = useState(false);
    return open ? h(AssistantReplyModel, {
      client: { updateProfile } as unknown as Parameters<typeof AssistantReplyModel>[0]["client"],
      profile: assistantProfileDefaults, projectId: "", disabled: false, current: () => true,
      reviewRequired, onReviewRequired, onRefresh: refresh, onSaved: vi.fn(),
    }) : null;
  }
  const render = () => act(async () => root.render(h(Workspace)));
  // Choosing drafts the model; Save (when offered) writes it.
  const choose = async (model = "GPT-2") => {
    await act(async () => [...container.querySelectorAll("p")].find(row => row.textContent === model)!.click());
    await act(async () => container.querySelector<HTMLButtonElement>("[data-save]")?.click());
  };
  const refreshRow = (count = 1) => act(async () => {
    const button = [...container.querySelectorAll("button")].find(row => row.textContent === "Refresh")!;
    for (let taps = 0; taps < count; taps++) button.click();
  });
  try {
    await render();
    await choose();
    expect(updateProfile).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Refresh");
    open = false;
    await render();
    open = true;
    await render();
    await choose();
    expect(updateProfile).toHaveBeenCalledOnce();
    await refreshRow(2);
    expect(refresh).toHaveBeenCalledOnce();
    await choose();
    expect(updateProfile).toHaveBeenCalledOnce();
    await refreshRow();
    expect(updateProfile).toHaveBeenCalledOnce();
    // The refreshed profile already holds GPT-2 with this effort: choosing it again writes nothing.
    await choose();
    expect(updateProfile).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-selected-model]")?.getAttribute("data-selected-model")).toBe("two");
    await choose("GPT-10");
    expect(updateProfile).toHaveBeenCalledTimes(2);
    expect(updateProfile.mock.calls[1][0]).toBe(2);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
