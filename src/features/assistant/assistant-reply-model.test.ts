import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { assistantProfileDefaults } from "../../../../host/assistant/profile-defaults";
import { AssistantReplyModel } from "./assistant-reply-model";

vi.mock("@/i18n", () => ({ useLocale: () => "tr" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/queries", () => ({ useHostQuery: () => ({
  data: { models: {
    codex: [{ id: "ten", name: "GPT-10" }, { id: "two", name: "GPT-2" }],
    claude: [{ id: "sonnet", name: "Sonnet" }],
  } },
}) }));
vi.mock("@/ui/provider-identity", () => ({
  ProviderIcon: ({ provider }: { provider: string }) => h("i", { "data-provider": provider }),
}));
vi.mock("@/ui/primitives", () => ({
  Notice: () => null, QueryState: () => null,
  SelectField: ({ value, options }: { value: string; options: { value: string; label: string; group: string; icon: ReactNode }[] }) =>
    h("div", null, options.map(row => h("p", {
      key: row.value, "data-group": row.group, "data-selected": row.value === value,
    }, row.icon, row.label))),
}));

it("sorts model names naturally within each provider and keeps an absent saved model in its group", () => {
  const html = renderToStaticMarkup(h(AssistantReplyModel, {
    client: {} as Parameters<typeof AssistantReplyModel>[0]["client"], projectId: "", disabled: false, onSaved: vi.fn(),
    profile: { ...assistantProfileDefaults, replyExecution: {
      harness: "claude", model: "claude:Older", runtimeMode: "supervised", modelSettings: {}, maxRunMinutes: 5,
    } },
  }));
  expect(html.indexOf("GPT-2")).toBeLessThan(html.indexOf("GPT-10"));
  expect(html).toContain('data-group="Codex" data-selected="false"><i data-provider="codex"></i>GPT-2');
  expect(html).toContain('data-group="Claude" data-selected="true"><i data-provider="claude"></i>Older');
});
