import { describe, expect, it } from "vitest";
import { transcriptEntries } from "./transcript-model";
import { applyToolVisibility, isToolRecord } from "./transcript-visibility";
import type { Block } from "./wire";

const block = (id: string, role: Block["role"], fields: Partial<Block> = {}): Block => ({ id, role, text: id, ...fields });
const turn = [
  block("u1", "user", { durationMs: 5 }),
  block("t-ok", "tool", { tool: { title: "Read", status: "completed" } }),
  block("t-bad", "tool", { tool: { title: "Run", status: "failed" } }),
  block("a-mid", "assistant"),
  block("sh", "tool", { shell: { command: "ls", exitCode: 0 } as never }),
  block("a-final", "assistant"),
];
const ids = (entries: ReturnType<typeof transcriptEntries>) =>
  entries.flatMap((entry) => (entry.kind === "message" ? [entry.id] : entry.blocks.map((b) => `${b.id}`)));
// "details" view keeps every record as its own entry or quiet activity, like the settled desktop view.
const entries = transcriptEntries(turn, "codex", { view: "messages", running: false });

describe("tool visibility", () => {
  it("shows everything by default", () => {
    expect(applyToolVisibility(entries, "all", false)).toBe(entries);
  });
  it("hides successful calls but keeps failures and answers", () => {
    const visible = ids(applyToolVisibility(entries, "hide-successful", false));
    expect(visible).toContain("t-bad");
    expect(visible).not.toContain("t-ok");
    expect(visible).not.toContain("sh");
    expect(visible).toContain("a-final");
  });
  it("hides every tool record in hide-all and keeps approvals", () => {
    const withApproval = transcriptEntries([...turn, block("ap", "tool", { approval: { id: "x" } as never })], "codex", { view: "messages", running: false });
    const visible = ids(applyToolVisibility(withApproval, "hide-all", false));
    expect(visible).not.toContain("t-bad");
    expect(visible).toContain("ap");
    expect(visible).toContain("a-mid");
  });
  it("zen keeps user messages and only the final answer per turn, moving the receipt", () => {
    const two = transcriptEntries([...turn, block("u2", "user"), block("a2", "assistant")], "codex", { view: "messages", running: false });
    const visible = applyToolVisibility(two, "zen", false);
    expect(ids(visible)).toEqual(["u1", "a-final", "u2", "a2"]);
    expect(visible.find((entry) => entry.id === "a-final")?.footer?.id).toBe("u1");
  });
  it("zen shows a single compact live row while the turn runs", () => {
    const running = transcriptEntries(
      [block("u1", "user"), block("t1", "tool", { tool: { title: "Read", status: "completed" } }), block("t2", "tool", { tool: { title: "Run", status: "running" } })],
      "codex",
      { view: "details", running: true },
    );
    const visible = applyToolVisibility(running, "zen", true);
    expect(ids(visible).filter((id) => id.startsWith("t"))).toEqual(["t2"]);
  });
});

describe("tool visibility presentation", () => {
  it("returns the previous derived entries when their source did not change", async () => {
    const { ToolVisibilityPresentation } = await import("./transcript-visibility");
    const presentation = new ToolVisibilityPresentation();
    const entries = transcriptEntries(turn, undefined, { view: "details", running: false });
    const first = presentation.update(entries, "hide-successful", false);
    const again = presentation.update(transcriptEntries(turn, undefined, { view: "details", running: false }), "hide-successful", false);
    expect(again).toBe(first);
    const zen = presentation.update(entries, "zen", false);
    expect(zen).toEqual(applyToolVisibility(entries, "zen", false));
  });
});

describe("fold durations", () => {
  const folded = [
    block("u1", "user", { durationMs: 46_000 }),
    block("t-ok", "tool", { tool: { title: "Read", status: "completed" } }),
    block("a-final", "assistant"),
  ];
  const entries = () => transcriptEntries(folded, undefined, { view: "messages", running: false });
  it("keeps the duration on the fold row while it is visible", () => {
    expect(applyToolVisibility(entries(), "all", false).at(-1)?.footerDuration).toBeUndefined();
  });
  it("moves the duration to the receipt when filtering hides the fold row", () => {
    for (const mode of ["hide-successful", "hide-all", "zen"] as const) {
      const shown = applyToolVisibility(entries(), mode, false);
      expect(shown.some((entry) => entry.kind === "activity")).toBe(false);
      expect(shown.at(-1)?.footer?.id).toBe("u1");
      expect(shown.at(-1)?.footerDuration).toBe(true);
    }
  });
});

it("never treats an agent-drawn visual as a hideable tool record", () => {
  const visual = block("v", "tool", {
    tool: { title: "conversation_visuals_render", status: "completed" },
    inlineVisual: { version: 2, id: "a".repeat(64), title: "Chart", height: 240 },
  } as Partial<Block>);
  expect(isToolRecord(visual)).toBe(false);
  expect(isToolRecord(block("t", "tool", { tool: { title: "Read", status: "completed" } } as Partial<Block>))).toBe(true);
});
