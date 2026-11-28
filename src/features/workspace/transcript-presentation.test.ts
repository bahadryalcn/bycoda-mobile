import { expect, it } from "vitest";
import { completeResponseText, TranscriptPresentation, transcriptEntries } from "./transcript-model";
import type { Block } from "./wire";
const block = (id: string, role: Block["role"], text = id): Block => ({ id, role, text });

it("matches complete regrouping through tail streaming, new turns, old edits, prepends and status changes", () => {
  const cache = new TranscriptPresentation();
  let blocks: Block[] = [block("u", "user"), block("a", "assistant"), { ...block("tool", "tool"), streaming: true }];
  for (let index = 0; index < 100; index++) {
    if (index % 11 === 0) blocks = [block(`old${index}`, "user"), ...blocks];
    else if (index % 5 === 0) blocks = [...blocks, block(`user${index}`, "user"), block(`answer${index}`, "assistant")];
    else if (index % 7 === 0) blocks = blocks.map((value, i) => i === 2 ? { ...value, text: "edited" } : value);
    else blocks = [...blocks.slice(0, -1), { ...blocks.at(-1)!, text: `tail${index}` }];
    const presentation = { view: index % 13 === 0 ? "details" as const : "messages" as const, running: index % 3 === 0 };
    expect(cache.update(blocks, "codex", presentation)).toEqual(transcriptEntries(blocks, "codex", presentation));
  }
  expect(cache.update([], "codex", { view: "messages", running: false })).toEqual([]);
});
it("retains completed row identities and never joins old text while the tail changes", () => {
  const cache = new TranscriptPresentation();
  const blocks = [block("u1", "user"), block("a1", "assistant"), block("u2", "user"), block("a2", "assistant")];
  const before = cache.update(blocks, "codex", { view: "messages", running: true });
  const after = cache.update([...blocks.slice(0, -1), { ...blocks[3]!, text: "updated" }], "codex", { view: "messages", running: true });
  expect(after[0]).toBe(before[0]); expect(after[1]).toBe(before[1]);
  expect(completeResponseText([block("u", "user"), block("a", "assistant", "first"), block("tool", "tool"), block("b", "assistant", "second"), block("next", "user"), block("c", "assistant")], "b")).toBe("first\n\nsecond");
  expect(completeResponseText(blocks, "u1")).toBeUndefined();
  // A block the Host sent as a preview makes the joined response incomplete.
  const preview = { ...block("p", "assistant", "cut"), remoteContent: { digest: "d" } } as (typeof blocks)[number];
  expect(completeResponseText([block("u", "user"), block("a", "assistant", "first"), preview], "a")).toBeUndefined();
});
