import { describe, expect, it } from "vitest";
import { transcriptEntries } from "./transcript-model";
import { applyToolVisibility } from "./transcript-visibility";
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
