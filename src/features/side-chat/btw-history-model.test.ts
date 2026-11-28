import { describe, expect, it } from "vitest";
import type { Block } from "@/domain/types";
import { btwHistory, compactBtwLine } from "./btw-history-model";

const thread = (id: string, createdAt: number, overrides: Record<string, unknown> = {}) => ({
  id,
  sourceEndBlockId: "a1",
  createdAt,
  updatedAt: createdAt,
  status: "ready",
  messages: [
    { id: `${id}-q`, role: "user", text: `Why ${id}?`, createdAt },
    { id: `${id}-a`, role: "assistant", text: `Because ${id}.`, createdAt: createdAt + 1 },
  ],
  ...overrides,
});
const user = (id: string, text: string, threads: unknown[]): Block =>
  ({ id, role: "user", text, btwThreads: threads }) as unknown as Block;

describe("btw history", () => {
  it("lists saved side threads of every turn, oldest first", () => {
    const blocks = [
      user("u1", "Fix   the\nlogin", [thread("t2", 20)]),
      { id: "a1", role: "assistant", text: "Done" } as Block,
      user("u2", "Add tests", [thread("t1", 10), thread("t3", 30, { status: "running" })]),
    ];
    const history = btwHistory(blocks);
    expect(history.map((entry) => entry.id)).toEqual(["t1", "t2", "t3"]);
    expect(history[1]).toEqual({
      id: "t2",
      title: "Why t2?",
      status: "ready",
      createdAt: 20,
      turnText: "Fix the login",
      messages: [
        { id: "t2-q", role: "user", text: "Why t2?" },
        { id: "t2-a", role: "assistant", text: "Because t2." },
      ],
    });
    expect(history[2]?.status).toBe("running");
  });

  it("keeps only readable messages and skips empty or malformed threads", () => {
    const blocks = [
      user("u1", "Turn", [
        thread("bad-status", 1, { status: "weird", messages: [{ id: "m", role: "assistant", text: "Only an answer" }] }),
        thread("empty", 2, { messages: [{ id: "m", role: "assistant", text: "   " }] }),
        { id: 5 },
        null,
        thread("failed", 3, { status: "error", error: "raw provider failure", messages: [{ role: "user", text: "Q" }, { role: "tool", text: "x" }] }),
      ]),
      { id: "a", role: "assistant", text: "", btwThreads: [thread("not-user", 4)] } as unknown as Block,
    ];
    const history = btwHistory(blocks);
    expect(history.map((entry) => [entry.id, entry.status, entry.title])).toEqual([
      ["bad-status", "ready", ""],
      ["failed", "error", "Q"],
    ]);
    expect(history[1]?.messages).toEqual([{ id: "0", role: "user", text: "Q" }]);
    expect(JSON.stringify(history)).not.toContain("raw provider failure");
  });

  it("returns nothing for sessions without side threads", () => {
    expect(btwHistory([])).toEqual([]);
    expect(btwHistory([{ id: "u", role: "user", text: "Hi" } as Block])).toEqual([]);
  });

  it("compacts long lines with an ellipsis", () => {
    expect(compactBtwLine("  a \n b  ")).toBe("a b");
    expect(compactBtwLine("x".repeat(80))).toHaveLength(60);
    expect(compactBtwLine("x".repeat(80)).endsWith("…")).toBe(true);
  });
});
