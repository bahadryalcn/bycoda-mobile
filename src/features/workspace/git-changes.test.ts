import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import type { GitDiffIndex } from "./wire";
vi.mock("@/ui/disclosure-motion", () => ({ DisclosureChevron: "DisclosureChevron" }));
vi.mock("react-native", () => ({ View: "View" }));
vi.mock("lucide-react-native/icons/circle-check", () => ({ default: "CheckCircle" }));
vi.mock("lucide-react-native/icons/download", () => ({ default: "Download" }));
vi.mock("lucide-react-native/icons/arrow-down-to-line", () => ({ default: "ArrowDownToLine" }));
vi.mock("lucide-react-native/icons/arrow-up-from-line", () => ({ default: "ArrowUpFromLine" }));
vi.mock("lucide-react-native/icons/wand-sparkles", () => ({ default: "WandSparkles" }));
vi.mock("lucide-react-native/icons/square", () => ({ default: "Square" }));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: "ChevronDown" }));
vi.mock("lucide-react-native/icons/chevron-right", () => ({ default: "ChevronRight" }));
vi.mock("lucide-react-native/icons/git-commit-horizontal", () => ({ default: "GitCommitHorizontal" }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/info-hint", () => ({ HintLabel: "HintLabel" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values?: Record<string, string | number>) => en.replace(/\{p(\d)\}/g, (_m, n: string) => String(values?.[`p${n}`])) }));
vi.mock("@/i18n", () => ({ useLocale: () => "de" }));
vi.mock("@/ui/primitives", () => ({ Body: "Body", Button: "Button", Disclosure: "Disclosure", Field: "Field", Row: "Row" }));
vi.mock("./git-file-row", () => ({ GitFileRow: "GitFileRow" }));
import { GitCommitPanel } from "./git-changes";

function nodes(node: ReactNode): ReactElement<Record<string, any>>[] {
  return isValidElement<Record<string, any>>(node)
    ? [node, ...Children.toArray(node.props.children).flatMap(nodes)]
    : [];
}

const base = {
  canRunWorkspace: false,
  fetching: false,
  onFetch: () => undefined,
  onChoose: () => undefined,
  onMessageChange: () => undefined,
};

function commitButton(panel: ReactNode) {
  return nodes(panel).find((node) => node.type === "Button" && node.props.label === "Commit")!;
}

it("explains a disabled Commit with the same blocker the state uses", () => {
  const index = { files: [{ relative: "a.ts", staged: true, unstaged: false, status: "M" }] } as unknown as GitDiffIndex;
  const panel = GitCommitPanel({ ...base, index, message: "  ", busy: false } as never);
  const button = commitButton(panel);
  expect(button.props.disabled).toBe(true);
  expect(button.props.accessibilityLabel).toBe("Commit. Write a commit message first.");
});

it("shows no visible hint for an empty message, only for blockers the screen cannot explain", () => {
  const file = { relative: "a.ts", staged: true, unstaged: false, status: "M" };
  const captions = (index: unknown) =>
    nodes(GitCommitPanel({ ...base, index, message: "", busy: false } as never))
      .filter((node) => node.type === "Body")
      .map((node) => node.props.children);
  expect(captions({ files: [file] })).not.toContain("Write a commit message first.");
  expect(captions({ files: [file], operation: { kind: "merge" } })).toContain(
    "Finish conflicts or the running operation first.",
  );
});

it("keeps a ready Commit enabled without a stale explanation", () => {
  const index = { files: [{ relative: "a.ts", staged: true, unstaged: false, status: "M" }] } as unknown as GitDiffIndex;
  const button = commitButton(GitCommitPanel({ ...base, index, message: "Fix", busy: false } as never));
  expect(button.props.disabled).toBe(false);
  expect(button.props.accessibilityLabel).toBeUndefined();
});

it("formats the staged count in the locale and explains a blocked Push", () => {
  const index = {
    files: Array.from({ length: 1284 }, (_, i) => ({ relative: `f${i}.ts`, staged: true, unstaged: false, status: "M" })),
    remote: "origin",
    ahead: 0,
    behind: 0,
  } as unknown as GitDiffIndex;
  const panel = GitCommitPanel({ ...base, index, message: "Fix", busy: false } as never);
  const disclosure = nodes(panel).find((node) => node.type === "Disclosure")!;
  expect(disclosure.props.detail).toBe("1.284 staged files");
  const push = nodes(panel).find((node) => node.type === "Button" && node.props.label === "Push")!;
  expect(push.props.disabled).toBe(true);
  expect(push.props.accessibilityLabel).toBe("Push. No local commits to push.");
});
