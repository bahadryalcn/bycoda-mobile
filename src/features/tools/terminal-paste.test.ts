import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ clipboard: "", toasts: [] as string[], confirms: [] as { detail: string; action: () => void }[] }));
vi.mock("expo-clipboard", () => ({ getStringAsync: async () => state.clipboard }));
vi.mock("@/ui/toast", () => ({ showToast: ({ message }: { message: string }) => state.toasts.push(message) }));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_title: string, detail: string, _label: string, action: () => void) => state.confirms.push({ detail, action }) }));
import { pasteIntoTerminal, terminalPasteLines, terminalPasteText } from "./terminal-paste";

const copy = (_tr: string, en: string, values?: Record<string, string | number>) => en.replace("{p0}", String(values?.p0 ?? ""));
beforeEach(() => { state.toasts = []; state.confirms = []; });

it("pastes one line at once and turns line breaks into Enter", async () => {
  const sent: string[] = [];
  state.clipboard = "ls -la";
  await pasteIntoTerminal(copy, (text) => sent.push(text));
  expect(sent).toEqual(["ls -la"]);
  expect(terminalPasteText("a\r\nb\nc")).toBe("a\rb\rc");
  expect(terminalPasteLines("a\nb\n")).toBe(2);
});

it("asks before pasting several lines and says when the clipboard is empty", async () => {
  const sent: string[] = [];
  state.clipboard = "one\ntwo";
  await pasteIntoTerminal(copy, (text) => sent.push(text));
  expect(sent).toEqual([]);
  expect(state.confirms[0]!.detail).toContain("2 lines");
  state.confirms[0]!.action();
  expect(sent).toEqual(["one\rtwo"]);
  state.clipboard = "";
  await pasteIntoTerminal(copy, (text) => sent.push(text));
  expect(state.toasts).toEqual(["Clipboard is empty"]);
});
