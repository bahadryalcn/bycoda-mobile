// @vitest-environment happy-dom
import { act, createElement as h, useState, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { assistantProfileDefaults } from "../../../../host/assistant/profile-defaults";
import { AssistantReplyModel } from "./assistant-reply-model";
import { filterSelection } from "@/ui/selection-model";

const fixture = vi.hoisted(() => ({ search: "", empty: false, discovering: false }));

vi.mock("@/i18n", () => ({ useLocale: () => "tr" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => undefined }));
vi.mock("@/state/queries", () => ({ useHostQuery: () => ({
  isSuccess: true,
  data: { pending: fixture.discovering ? ["codex"] : [], models: fixture.empty ? {} : {
    codex: [{ id: "ten", name: "GPT-10" }, { id: "two", name: "GPT-2" }],
    claude: [{ id: "sonnet", name: "Sonnet" }],
    grok: [{ id: "grok-4.7", name: "Grok 4.7" }],
  } },
}) }));
vi.mock("@/ui/provider-identity", () => ({
  ProviderIcon: ({ provider }: { provider: string }) => h("i", { "data-provider": provider }),
}));
vi.mock("@/ui/primitives", () => ({
  Loading: ({ label }: { label: string }) => h("p", { role: "status" }, label),
  Notice: ({ message, children }: PropsWithChildren<{ message: string }>) => h("section", null, message, children), QueryState: () => null,
  StateView: ({ title }: { title: string }) => h("p", null, title),
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => h("button", { onClick: onPress }, label),
  SelectField: ({ disabled, value, options, onChange }: { disabled: boolean; value?: string; options: { value: string; label: string; group: string; icon: ReactNode }[]; onChange: (value: string) => void }) =>
    h("div", { "aria-disabled": disabled }, filterSelection(options, fixture.search, "tr").map(row => h("p", {
      key: row.value, "data-group": row.group, "data-selected": row.value === value,
      onClick: () => onChange(row.value),
    }, row.icon, row.label))),
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

it("sorts model names naturally within each provider and keeps an absent saved model in its group", () => {
  const html = render();
  expect(html.indexOf("GPT-2")).toBeLessThan(html.indexOf("GPT-10"));
  expect(html).toContain('data-group="OpenAI · Codex" data-selected="false"><i data-provider="codex"></i>GPT-2');
  expect(html).toContain('data-group="Claude" data-selected="true"><i data-provider="claude"></i>Older');
});

it.each([["OpenAI", "GPT-2"], ["openai", "GPT-2"], ["open ai", "GPT-2"], ["Grok", "Grok 4.7"]])("finds a model using the %s provider name", (query, model) => {
  fixture.search = query;
  try {
    expect(render()).toContain(model);
  } finally {
    fixture.search = "";
  }
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
    expect(empty).toContain('data-selected="true"><i data-provider="claude"></i>Older');
    expect(empty).not.toContain('role="status"');
  } finally {
    fixture.empty = false;
    fixture.discovering = false;
  }
});

it("offers a first reply model and saves it only after an explicit selection", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const replyExecution = {
    harness: "codex" as const, model: "two", runtimeMode: "supervised" as const,
    maxRunMinutes: 60, modelSettings: {},
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
    expect(container.querySelector('[data-selected="true"]')).toBeNull();
    expect(updateProfile).not.toHaveBeenCalled();
    const option = [...container.querySelectorAll("p")].find(row => row.textContent === "GPT-2")!;
    await act(async () => option.click());
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
    harness: "codex" as const, model: "two", runtimeMode: "supervised" as const, modelSettings: {}, maxRunMinutes: 60,
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
  const choose = (model = "GPT-2") => act(async () => [...container.querySelectorAll("p")].find(row => row.textContent === model)!.click());
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
    await choose();
    expect(updateProfile).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-selected="true"]')?.textContent).toBe("GPT-2");
    await choose("GPT-10");
    expect(updateProfile).toHaveBeenCalledTimes(2);
    expect(updateProfile.mock.calls[1][0]).toBe(2);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
