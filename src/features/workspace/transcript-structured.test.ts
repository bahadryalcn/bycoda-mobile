import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ documents: [] as { code: string; compact?: boolean; error?: boolean; allowPreview?: boolean }[] }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { Body: Wrap, Row: Wrap, CodePanel: Wrap, CodeText: Wrap, Badge: ({ label }: { label: string }) => createElement("span", null, label) };
});
vi.mock("@/ui/message-code", () => ({ MessageCode: (props: typeof fixture.documents[number]) => {
  fixture.documents.push(props);
  return createElement("span", null, "Bounded document");
} }));
vi.mock("@/ui/message-text", () => ({ MessageText: ({ text }: { text: string }) => createElement("p", null, text) }));
vi.mock("@/ui/plan-steps", () => ({ PlanSteps: () => null }));
vi.mock("./transcript-tool-preview", () => ({ TranscriptToolPreview: () => null }));
import { TranscriptStructured } from "./transcript-structured";
import type { Block } from "./wire";

it("keeps realistic long shell output in the bounded reader with failure and truncation visible", () => {
  const output = Array.from({ length: 300 }, (_, index) => `src/features/workspace/recovery-${index}.test.ts passed`).join("\n") + "\nFAIL session authority changed";
  const block: Block = { id: "shell", role: "tool", text: "", shell: { command: "pnpm test src/features/workspace --maxWorkers=2", output, running: false, exitCode: 1, truncated: true } };
  fixture.documents = [];
  const html = renderToStaticMarkup(createElement(TranscriptStructured, { block }));
  expect(html).not.toContain(output);
  expect(fixture.documents).toEqual([
    expect.objectContaining({ code: block.shell!.command, compact: true, allowPreview: false }),
    expect.objectContaining({ code: output, compact: true, error: true, allowPreview: false }),
  ]);
  expect(html).toContain("exit 1");
  expect(html).toContain("Output was truncated.");
});

it("renders authoritative answered-question history even without other structured metadata", () => {
  const block: Block = { id: "answered", role: "user", text: "", questionAnswers: [
    { prompt: "Which folders must remain?", answers: ["İstanbul/東京", "Preserve the local draft and attachments."] },
  ] };
  const html = renderToStaticMarkup(createElement(TranscriptStructured, { block }));
  expect(html).toContain("Which folders must remain?");
  expect(html).toContain("İstanbul/東京");
  expect(html).toContain("Preserve the local draft and attachments.");
  expect(html).not.toContain("button");
});
