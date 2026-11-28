import { describe, expect, it, vi } from "vitest";
import { createElement, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const opened = vi.hoisted(() => ({ files: [] as string[][], urls: [] as string[] }));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
  Linking: { openURL: (url: string) => { opened.urls.push(url); return Promise.resolve(); } },
}));
vi.mock("lucide-react-native/icons/globe", () => ({ default: () => null }));
vi.mock("@/ui/primitives", () => ({
  Body: ({ children }: PropsWithChildren) => createElement("h3", null, children),
  Button: ({ label }: { label: string }) => createElement("button", { "data-more": true }, label),
}));
vi.mock("@/ui/chat", () => ({
  ChatChangedFile: ({ name, folder, statusLabel, counts, onPress }: { name: string; folder?: string; statusLabel?: string; counts?: { additions: number; deletions: number }; onPress?: () => void }) => {
    onPress?.();
    return createElement("li", { "data-file": name, "data-folder": folder ?? "", "data-status": statusLabel ?? "", "data-pressable": !!onPress }, counts ? `+${counts.additions} -${counts.deletions}` : "");
  },
}));
vi.mock("@/ui/chat-controls", () => ({
  ChatSummary: ({ label, detail }: { label: string; detail?: string }) => createElement("a", { "data-source": label }, detail ?? ""),
}));
vi.mock("@/ui/copy", () => ({
  useCopy: () => (_tr: string, en: string, values?: Record<string, string | number>) =>
    en.replace(/\{(p\d+)\}/g, (_: string, key: string) => String(values?.[key])),
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/ui/error-message", () => ({ errorMessage: () => "error" }));
vi.mock("@/ui/tokens", () => ({ space: { xxs: 2, xs: 4, sm: 6 } }));
import { TranscriptTurnSummary } from "./transcript-turn-summary-view";
import type { TurnChangedFile, TurnSummary } from "./transcript-turn-summary";

const file = (path: string, extra: Partial<TurnChangedFile> = {}): TurnChangedFile => ({ key: path, path, blockIds: [path], ...extra });
const render = (summary: TurnSummary, onOpenFile?: (file: TurnChangedFile) => void) =>
  renderToStaticMarkup(createElement(TranscriptTurnSummary, { summary, cwd: "/repo", onOpenFile }));

describe("turn summary strip", () => {
  it("names each changed file ahead of its workspace folder, with its mark and line delta", () => {
    const html = render({
      files: [
        file("/repo/src/a.ts", { status: "added", counts: { additions: 3, deletions: 0 } }),
        file("/repo/b.ts", { status: "deleted" }),
      ],
      sources: [],
    });
    expect(html).toContain("2 files changed");
    expect(html).toContain('data-file="a.ts" data-folder="src" data-status="Added"');
    expect(html).toContain("+3 -0");
    expect(html).toContain('data-file="b.ts" data-folder="" data-status="Deleted"');
  });

  it("opens exactly the edits of the pressed file", () => {
    opened.files = [];
    render({ files: [file("/repo/a.ts", { blockIds: ["e1", "e3"] })], sources: [] }, (value) => opened.files.push(value.blockIds));
    expect(opened.files).toEqual([["e1", "e3"]]);
  });

  it("is a plain record when nothing can open the edits", () => {
    expect(render({ files: [file("/repo/a.ts")], sources: [] })).toContain('data-pressable="false"');
  });

  it("shows six rows and offers the rest in place", () => {
    const files = Array.from({ length: 8 }, (_, index) => file(`/repo/f${index}.ts`));
    const html = render({ files, sources: [] });
    expect(html.match(/data-file=/g)).toHaveLength(6);
    expect(html).toContain("Show 2 more files");
  });

  it("lists web sources and leaves loopback pages to the session browser", () => {
    const html = render({
      files: [],
      sources: [
        { title: "Docs", url: "https://docs.dev/a", domain: "docs.dev" },
        { title: "Local", url: "http://localhost:3000", domain: "localhost" },
      ],
    });
    expect(html).toContain("Sources");
    expect(html).toContain('data-source="Docs"');
    expect(html).not.toContain("Local");
    expect(html).not.toContain("files changed");
  });

  it("renders nothing when only loopback sources remain", () => {
    expect(render({ files: [], sources: [{ title: "Local", url: "http://127.0.0.1:5173", domain: "127.0.0.1" }] })).toBe("");
  });
});
