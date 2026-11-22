import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { ActivityInspector } from "./activity-inspector";
import type { Block } from "./wire";

vi.mock("react-native", () => ({
  FlatList: ({ data, renderItem, ListEmptyComponent }: {
    data: Block[]; renderItem: (entry: { item: Block; index: number }) => ReactNode; ListEmptyComponent?: ReactNode;
  }) => h("ul", null, data.length ? data.map((item, index) => h("li", { key: item.id }, renderItem({ item, index }))) : h("li", null, ListEmptyComponent)),
}));
vi.mock("lucide-react-native/icons/terminal", () => ({ default: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values: Record<string, number> = {}) =>
  en.replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name])) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/primitives", () => ({
  Sheet: ({ title, headerAction, children, scroll }: { title: string; headerAction?: ReactNode; children: ReactNode; scroll: boolean }) =>
    h("section", { "aria-label": title, "data-scroll": scroll }, headerAction, children),
  StateView: ({ title }: { title: string }) => h("p", null, title),
}));
vi.mock("@/ui/chat-controls", () => ({
  ChatSummary: ({ label }: { label: string }) => h("button", null, label),
  ChatToolbarAction: ({ label }: { label: string }) => h("button", null, label),
}));
vi.mock("./transcript-block", () => ({ TranscriptBlock: ({ block }: { block: Block }) => h("article", null, block.text) }));

const action = (id: string, text: string, internal = false): Block => ({ id, role: "tool", text, internal });
const render = (blocks: Block[], selectedId?: string) => renderToStaticMarkup(h(ActivityInspector, {
  blocks, inspection: { ids: ["selected", "other"], selectedId }, live: true, onChange: vi.fn(),
  scope: { machineId: "computer", sessionId: "conversation" }, getRevision: () => 1, disabled: false, onCommand: vi.fn(),
}));

it("keeps the selected action view when its record temporarily disappears", () => {
  const missing = render([action("other", "Other action")], "selected");
  expect(missing).toContain("Action unavailable");
  expect(missing).toContain("Action list");
  expect(missing).not.toContain("Other action");
  const restored = render([action("selected", "Current output"), action("other", "Other action")], "selected");
  expect(restored).toContain("Current output");
  expect(restored).toContain("Action 1 / 2");
});

it("explains the empty activity list and omits internal records from both views", () => {
  const blocks = [action("selected", "Internal output", true)];
  expect(render(blocks)).toContain("No actions to show");
  expect(render(blocks)).not.toContain("Internal output");
  expect(render(blocks, "selected")).toContain("Action unavailable");
  expect(render(blocks, "selected")).not.toContain("Internal output");
});
