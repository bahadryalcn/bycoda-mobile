import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { GitCommitBar } from "./git-changes";

vi.mock("@/ui/disclosure-motion", () => ({ DisclosureChevron: () => null }));
vi.mock("react-native", () => ({ View: ({ children }: { children: ReactNode }) => h("div", null, children) }));
vi.mock("lucide-react-native/icons/circle-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/download", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/arrow-down-to-line", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/arrow-up-from-line", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/wand-sparkles", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/square", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-right", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/git-commit-horizontal", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/info-hint", () => ({ HintLabel: () => null }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/ui/primitives", () => ({
  Body: () => null,
  Button: ({ label }: { label: string }) => h("button", null, label),
  IconButton: ({ label }: { label: string }) => h("button", { "aria-label": label }),
  ErrorNotice: () => null,
  Disclosure: ({ label }: { label: string }) => h("button", null, label),
  Input: ({ label, value }: { label: string; value: string }) => h("textarea", { "aria-label": label, defaultValue: value }),
  Row: () => null,
}));
vi.mock("./git-file-row", () => ({ GitFileRow: () => null }));

type CommitIndex = Parameters<typeof GitCommitBar>[0]["index"];
const cleanIndex: CommitIndex = { files: [], ahead: 0, remote: null, branch: "main" };
const changedIndex: CommitIndex = { ...cleanIndex, files: [{
  relative: "test.ts", path: "test.ts", staged: true, unstaged: false, status: "M", additions: 1, deletions: 0,
}] };
const generation = {
  available: true,
  pending: false,
  suggestion: undefined,
  error: undefined,
  start: vi.fn(),
  cancel: vi.fn(),
  useSuggestion: vi.fn(),
};

it("puts a labeled, icon-only generation action beside the commit input", () => {
  const html = renderToStaticMarkup(h(GitCommitBar, {
    index: changedIndex, message: "Keep this draft", onMessageChange: vi.fn(),
    generation, busy: false, onCommit: vi.fn(), onPush: vi.fn(),
  }));
  expect(html).toContain('<textarea aria-label="Commit message">Keep this draft</textarea><div><button aria-label="Generate commit message"></button></div>');
  expect(html).not.toContain(">Generate commit message<");
});

it("offers cancellation in the same slot while a message is generated", () => {
  const html = renderToStaticMarkup(h(GitCommitBar, {
    index: changedIndex, message: "Keep this draft", onMessageChange: vi.fn(),
    generation: { ...generation, pending: true }, busy: false, onCommit: vi.fn(), onPush: vi.fn(),
  }));
  expect(html).toContain('<textarea aria-label="Commit message">Keep this draft</textarea><div><button aria-label="Generating commit message… Cancel"></button></div>');
});

const render = (index: CommitIndex, message: string) =>
  renderToStaticMarkup(h(GitCommitBar, {
    index, message, onMessageChange: vi.fn(), busy: false, onCommit: vi.fn(), onPush: vi.fn(),
  }));

it("omits the inactive commit composer while the working folder is clean", () => {
  expect(render(cleanIndex, "")).toBe("");
});

it("keeps an existing draft editable on a clean working folder", () => {
  const html = render(cleanIndex, "Keep this draft");
  expect(html).toContain('<textarea aria-label="Commit message">Keep this draft</textarea>');
  expect(html).not.toContain("<button>");
});

it("keeps the Push action when there are local commits to send", () => {
  const html = render({ ...cleanIndex, ahead: 2, remote: "origin" }, "");
  expect(html).toContain("<button>Push (2)</button>");
  expect(html).not.toContain("↑");
});
