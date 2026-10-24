import { expect, it } from "vitest";
import { appendComposerTransfer } from "./composer-transfer-model";
const scope = { machineId: "machine", sessionId: "session" };
it("appends without replacing prose, attachments, mention metadata or mutating the current draft", () => {
  const draft = { text: "Existing selected draft", attachments: [{ id: "attachment" }], selectedMentionRefs: [{ id: "mention" }] };
  const next = appendComposerTransfer(draft, { ...scope, text: "> exact excerpt" }, scope, "machine", true);
  expect(next.text).toBe("Existing selected draft\n\n> exact excerpt");
  expect(next.attachments).toBe(draft.attachments); expect(next.selectedMentionRefs).toBe(draft.selectedMentionRefs);
  expect(draft.text).toBe("Existing selected draft");
});
it("rejects stale destination and unavailable composer instead of writing elsewhere", () => {
  for (const request of [{ ...scope, machineId: "other", text: "x" }, { ...scope, sessionId: "other", text: "x" }])
    expect(() => appendComposerTransfer({ text: "draft" }, request, scope, "machine", true)).toThrow("unavailable");
  expect(() => appendComposerTransfer({ text: "draft" }, { ...scope, text: "x" }, scope, "other", true)).toThrow("unavailable");
  expect(() => appendComposerTransfer({ text: "draft" }, { ...scope, text: "x" }, scope, "machine", false)).toThrow("unavailable");
});
it("refuses empty, unbounded or overflowing draft context", () => {
  for (const text of [" ", "\0", "x".repeat(40_001)]) expect(() => appendComposerTransfer({ text: "" }, { ...scope, text }, scope, "machine", true)).toThrow();
  expect(() => appendComposerTransfer({ text: "x".repeat(256_000) }, { ...scope, text: "x" }, scope, "machine", true)).toThrow("too long");
});
it("attaches one full note snapshot without rewriting prose or other draft owners", () => {
  const draft = { text: "Owner prose", attachments: [{ id: "attachment" }], selectedMentionRefs: [] };
  const noteCard = { id: "note-1", slug: "note", title: "Note", body: "Complete body\n" };
  const next = appendComposerTransfer(draft, { ...scope, text: "", noteCard }, scope, "machine", true);
  expect(next).toEqual({ ...draft, noteCard });
  expect(next.attachments).toBe(draft.attachments);
  expect(next.selectedMentionRefs).toBe(draft.selectedMentionRefs);
  expect(() => appendComposerTransfer(next, { ...scope, text: "", noteCard }, scope, "machine", true)).toThrow(/Remove/);
  expect(() => appendComposerTransfer(draft, { ...scope, text: "", noteCard: { ...noteCard, body: "x".repeat(64_001) } }, scope, "machine", true)).toThrow(/oversized/);
});
