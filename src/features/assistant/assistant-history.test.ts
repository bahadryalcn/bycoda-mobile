import { expect, it } from "vitest";
import type {
  AssistantMessage,
  AssistantThread,
} from "../../../../src/shared/model/host-contracts/assistant";
import {
  assistantHistoryPage,
  assistantMessageVisible,
  assistantSummaryVisible,
  assistantThreadVisible,
  assistantActivityVisible,
} from "./assistant-history";
const message = (id: string, createdAt: number, projectIds?: string[]): AssistantMessage => ({
  id,
  version: 1,
  createdAt,
  updatedAt: createdAt,
  threadId: "thread",
  role: "user",
  via: "text",
  text: "Canonical text",
  jobIds: [],
  ...(projectIds ? { projectIds } : {}),
});
it("shows only actual journal operations with explicit visible contributors", () => {
  const access = { ready: true, visible: (id: string) => id === "visible" };
  const activity = { id: "operation", version: 1, createdAt: 1, updatedAt: 1, kind: "action.completed", summary: "Actual result", operation: { identity: "identity", tool: "files:write", target: "file", outcome: "completed" }, projectIds: [] as string[] };
  expect(assistantActivityVisible(activity, access)).toBe(true);
  expect(assistantActivityVisible({ ...activity, projectIds: ["visible", "hidden"] }, access)).toBe(false);
  expect(assistantActivityVisible({ ...activity, projectIds: undefined }, access)).toBe(false);
  expect(assistantActivityVisible({ ...activity, operation: undefined }, access)).toBe(false);
  expect(assistantActivityVisible({ ...activity, projectIds: ["visible"] }, { ...access, ready: false })).toBe(false);
});
it("hides unknown or mixed hidden contributors and unproven summaries instead of treating them as global", () => {
  const access = { ready: true, visible: (id: string) => id === "visible" };
  expect(assistantMessageVisible(message("global", 1, []), access)).toBe(true);
  expect(assistantMessageVisible(message("unknown", 1), access)).toBe(false);
  expect(assistantMessageVisible(message("mixed", 1, ["visible", "hidden"]), access)).toBe(false);
  expect(
    assistantMessageVisible(message("visible", 1, ["visible"]), { ...access, ready: false }),
  ).toBe(false);
  const thread = {
    id: "thread",
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    summary: "Opaque private summary",
  } as AssistantThread;
  expect(assistantSummaryVisible(thread, access)).toBe(false);
  expect(assistantThreadVisible({ ...thread, projectId: "hidden" }, access)).toBe(false);
  expect(
    assistantSummaryVisible(
      {
        ...thread,
        summaryProof: {
          id: "proof",
          version: 1,
          projectIds: ["visible", "hidden"],
          throughMessageId: "source",
          messageCount: 20,
          createdAt: 1,
          inputTruncated: false,
          omittedMessages: 0,
        },
      },
      access,
    ),
  ).toBe(false);
});
it("keeps source cursors for concealed pages, deduplicates repeated records and refuses a foreign conversation", () => {
  const page = assistantHistoryPage(
    [message("old", 10, []), message("new", 20, ["hidden"])],
    "thread",
    [message("new", 20, ["hidden"])],
  );
  expect(page.before).toBe(10);
  expect(page.beforeId).toBe("old");
  expect(page.messages.map((row) => row.id)).toEqual(["old", "new"]);
  expect(() =>
    assistantHistoryPage([{ ...message("foreign", 1, []), threadId: "another" }], "thread"),
  ).toThrow("source changed");
});
it("prepends older tied records in canonical Host order and keeps a concealed oldest cursor", () => {
  const first = assistantHistoryPage(
    [message("z-oldest", 1, ["hidden"]), message("b-middle", 1, [])],
    "thread",
  );
  const combined = assistantHistoryPage([message("new-id-a", 1, [])], "thread", first.messages);
  expect(combined.messages.map((row) => row.id)).toEqual(["z-oldest", "b-middle", "new-id-a"]);
  const older = assistantHistoryPage(
    [message("y-older", 1, []), message("c-older", 1, [])],
    "thread",
    combined.messages,
    true,
  );
  expect(older.messages.map((row) => row.id)).toEqual([
    "y-older",
    "c-older",
    "z-oldest",
    "b-middle",
    "new-id-a",
  ]);
  expect(older.beforeId).toBe("y-older");
  expect(() =>
    assistantHistoryPage([message("later", 2, []), message("earlier", 1, [])], "thread"),
  ).toThrow("page order changed");
});
