// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RemoteInboxItem } from "../../../../src/features/inbox/model/remoteInbox";
import { ProviderInboxRow } from "./provider-list";

vi.mock("../workspace/pull-request-state-badge", () => ({ PullRequestStateBadge: ({ label }: { label: string }) => createElement("span", null, label) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/issue-summary", () => ({ IssueSummary: () => null }));
vi.mock("../management/shared/record-bits", () => ({ useRelativeTime: () => () => "" }));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("span", null, children);
  return { Body: Wrap, Row: Wrap, Badge: ({ label }: { label: string }) => createElement("span", null, label),
    NavigationRow: ({ label, detail, accessibilityLabel, supporting, trailing, onPress }: {
      label: string; detail?: string; accessibilityLabel?: string; supporting?: ReactNode; trailing?: ReactNode; onPress: () => void;
    }) => createElement("button", { "aria-label": accessibilityLabel ?? [label, detail].filter(Boolean).join(". "), onClick: onPress }, label, detail, supporting, trailing),
  };
});
let root: ReturnType<typeof createRoot>;
const container = document.createElement("div"), open = vi.fn();
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it.each([
  ["OPEN", "Open"], ["CHANGES_REQUESTED", "Changes requested"],
  ["Waiting for security and owner approval", "Waiting for security and owner approval"],
])("announces the complete %s state and opens the exact original provider item", async (state, label) => {
  const item: RemoteInboxItem = { provider: "github", kind: "pr", repo: "owner/original-project", number: 128,
    identifier: "REVIEW-128", projectPath: "/original-project", title: "Review mobile identity", state, draft: false, labels: [], assignees: [],
    updatedAt: "2026-11-03T00:00:00Z", url: "https://example.invalid/original/128" };
  await act(async () => root.render(createElement(ProviderInboxRow, { item, onOpen: open })));
  const row = container.querySelector("button")!;
  expect(row.getAttribute("aria-label")).toBe(`Review mobile identity. GitHub · REVIEW-128 · owner/original-project. ${label}`);
  expect(row.textContent).toContain(label);
  await act(async () => row.click()); expect(open).toHaveBeenCalledOnce(); expect(open.mock.calls[0][0]).toBe(item);
});
